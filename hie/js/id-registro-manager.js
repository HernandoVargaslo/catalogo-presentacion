/**
 * IdRegistroManager - Singleton para gestión consistente de IDs de registro
 * Maneja la resolución, cache y validación de IDs de registro para todos los formularios
 */

class IdRegistroManager {
  constructor() {
    if (IdRegistroManager.instance) {
      return IdRegistroManager.instance;
    }

    // Cache de IDs de registro por SRIG
    this.idCache = new Map();

    // Cache de mapeos inversos (idRegistro -> srigId)
    this.reverseCache = new Map();

    // Configuración
    this.config = {
      cacheExpiry: 300000, // 5 minutos de cache
      maxRetries: 3,
      retryDelay: 1000
    };

    // Registro de errores
    this.errorLog = [];

    IdRegistroManager.instance = this;

    // Registrar el manager globalmente
    window.IdRegistroManager = this;

    window.debug?.log('🆔 IdRegistroManager inicializado');
  }

  /**
   * Obtiene el ID de registro para un SRIG específico
   * @param {string} srigId - ID del SRIG
   * @param {boolean} useCache - Si usar cache (default: true)
   * @returns {Promise<string|null>} ID de registro o null si no se encuentra
   */
  async getIdRegistro(srigId, useCache = true) {
    if (!srigId) {
      window.debug?.warn('⚠️ IdRegistroManager: srigId no proporcionado');
      return null;
    }

    // Verificar cache primero
    if (useCache && this.idCache.has(srigId)) {
      const cached = this.idCache.get(srigId);

      // Verificar si el cache no ha expirado
      if (Date.now() - cached.timestamp < this.config.cacheExpiry) {
        window.debug?.log(`🆔 ID de registro para ${srigId} obtenido del cache: ${cached.idRegistro}`);
        return cached.idRegistro;
      } else {
        // Cache expirado, eliminarlo
        this.idCache.delete(srigId);
        this.reverseCache.delete(cached.idRegistro);
      }
    }

    // Intentar obtener desde la función global
    try {
      const idRegistro = await this.resolveFromGlobalFunction(srigId);
      if (idRegistro) {
        this.cacheIdRegistro(srigId, idRegistro);
        return idRegistro;
      }
    } catch (error) {
      this.logError('getIdRegistro', srigId, error);
    }

    // Fallback: usar el srigId como idRegistro
    window.debug?.warn(`⚠️ No se pudo obtener ID_REGISTRO para SRIG ${srigId}, usando srigId como fallback`);
    this.cacheIdRegistro(srigId, srigId);
    return srigId;
  }

  /**
   * Obtiene el ID de registro de forma síncrona (solo desde cache)
   * @param {string} srigId - ID del SRIG
   * @returns {string|null} ID de registro cached o null
   */
  getIdRegistroSync(srigId) {
    if (!srigId) return null;

    if (this.idCache.has(srigId)) {
      const cached = this.idCache.get(srigId);

      // Verificar si el cache no ha expirado
      if (Date.now() - cached.timestamp < this.config.cacheExpiry) {
        return cached.idRegistro;
      } else {
        // Cache expirado, eliminarlo
        this.idCache.delete(srigId);
        this.reverseCache.delete(cached.idRegistro);
      }
    }

    return null;
  }

  /**
   * Resuelve el ID desde la función global con reintentos
   */
  async resolveFromGlobalFunction(srigId) {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Verificar si la función global existe
        if (typeof window.getGlobalIdRegistro === 'function') {
          const idRegistro = window.getGlobalIdRegistro(srigId);

          if (idRegistro) {
            window.debug?.log(`🆔 ID de registro obtenido desde función global: ${srigId} -> ${idRegistro} (intento ${attempt})`);
            return idRegistro;
          }
        } else {
          window.debug?.warn('⚠️ Función window.getGlobalIdRegistro no disponible');
          break; // No reintentar si la función no existe
        }

        // Si no se obtuvo el ID y no es el último intento, esperar antes de reintentar
        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryDelay * attempt);
        }

      } catch (error) {
        window.debug?.error(`❌ Error en intento ${attempt} para obtener ID de registro de ${srigId}:`, error);

        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryDelay * attempt);
        }
      }
    }

    return null;
  }

  /**
   * Almacena en cache un mapeo srigId -> idRegistro
   */
  cacheIdRegistro(srigId, idRegistro) {
    // Limpiar mapeo anterior si existe
    if (this.idCache.has(srigId)) {
      const oldCached = this.idCache.get(srigId);
      this.reverseCache.delete(oldCached.idRegistro);
    }

    // Agregar nuevo mapeo
    const cacheEntry = {
      idRegistro,
      timestamp: Date.now(),
      srigId
    };

    this.idCache.set(srigId, cacheEntry);
    this.reverseCache.set(idRegistro, { srigId, timestamp: Date.now() });

    window.debug?.log(`🆔 ID de registro cached: ${srigId} -> ${idRegistro}`);
  }

  /**
   * Obtiene el SRIG ID desde un ID de registro
   */
  getSrigIdDeIdRegistro(idRegistro) {
    if (!idRegistro) return null;

    if (this.reverseCache.has(idRegistro)) {
      const cached = this.reverseCache.get(idRegistro);

      // Verificar si el cache no ha expirado
      if (Date.now() - cached.timestamp < this.config.cacheExpiry) {
        return cached.srigId;
      } else {
        // Cache expirado, eliminarlo
        this.reverseCache.delete(idRegistro);
        if (this.idCache.has(cached.srigId)) {
          this.idCache.delete(cached.srigId);
        }
      }
    }

    // Si no está en cache, buscar en todos los mapeos
    for (const [srigId, cached] of this.idCache) {
      if (cached.idRegistro === idRegistro) {
        return srigId;
      }
    }

    return null;
  }

  /**
   * Valida que un ID de registro sea consistente
   */
  async validateIdRegistro(srigId, expectedIdRegistro) {
    const actualIdRegistro = await this.getIdRegistro(srigId);
    const isValid = actualIdRegistro === expectedIdRegistro;

    if (!isValid) {
      this.logError('validateIdRegistro', srigId,
        `ID inconsistente: esperado ${expectedIdRegistro}, obtenido ${actualIdRegistro}`);
    }

    return isValid;
  }

  /**
   * Pre-carga IDs de registro para múltiples SRIGs
   */
  async preloadIdRegistros(srigIds) {
    const promises = srigIds.map(srigId => this.getIdRegistro(srigId));
    const results = await Promise.allSettled(promises);

    const loaded = [];
    const failed = [];

    results.forEach((result, index) => {
      const srigId = srigIds[index];
      if (result.status === 'fulfilled' && result.value) {
        loaded.push({ srigId, idRegistro: result.value });
      } else {
        failed.push(srigId);
      }
    });

    window.debug?.log(`🆔 Pre-carga completada: ${loaded.length} exitosos, ${failed.length} fallidos`);

    return { loaded, failed };
  }

  /**
   * Limpia el cache de un SRIG específico
   */
  clearCacheForSrig(srigId) {
    if (this.idCache.has(srigId)) {
      const cached = this.idCache.get(srigId);
      this.reverseCache.delete(cached.idRegistro);
      this.idCache.delete(srigId);
      window.debug?.log(`🧹 Cache limpiado para SRIG ${srigId}`);
    }
  }

  /**
   * Limpia todo el cache
   */
  clearAllCache() {
    const count = this.idCache.size;
    this.idCache.clear();
    this.reverseCache.clear();
    window.debug?.log(`🧹 Todo el cache de IDs limpiado (${count} entradas)`);
  }

  /**
   * Registra un error
   */
  logError(operation, srigId, error) {
    const errorEntry = {
      operation,
      srigId,
      error: error.message || error,
      timestamp: Date.now(),
      stack: error.stack
    };

    this.errorLog.push(errorEntry);

    // Mantener solo los últimos 100 errores
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }

    window.debug?.error(`❌ IdRegistroManager ${operation} error para ${srigId}:`, error);
  }

  /**
   * Obtiene estadísticas del manager
   */
  getStats() {
    const now = Date.now();
    const validCacheEntries = Array.from(this.idCache.values())
      .filter(cached => now - cached.timestamp < this.config.cacheExpiry);

    return {
      totalCached: this.idCache.size,
      validCached: validCacheEntries.length,
      errors: this.errorLog.length,
      cacheHitRate: this.calculateCacheHitRate(),
      oldestCacheEntry: validCacheEntries.length > 0
        ? Math.min(...validCacheEntries.map(c => c.timestamp))
        : null
    };
  }

  /**
   * Calcula la tasa de aciertos del cache
   */
  calculateCacheHitRate() {
    // Simplificado: basado en errores vs total de operaciones
    const totalOperations = this.idCache.size + this.errorLog.length;
    if (totalOperations === 0) return 1.0;

    return this.idCache.size / totalOperations;
  }

  /**
   * Función utilitaria para sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Debugging: Lista todos los mapeos cached
   */
  debugListMappings() {
    window.debug?.log('🆔 Mapeos cached de ID de registro:');
    for (const [srigId, cached] of this.idCache) {
      const age = Date.now() - cached.timestamp;
      const expired = age >= this.config.cacheExpiry;
      window.debug?.log(`  ${srigId} -> ${cached.idRegistro} (age: ${age}ms, expired: ${expired})`);
    }
  }
}

// Exportar la clase y crear instancia singleton
window.IdRegistroManager = IdRegistroManager;

// Crear instancia singleton al cargar
new IdRegistroManager();

window.debug?.log('🆔 IdRegistroManager cargado y disponible globalmente');