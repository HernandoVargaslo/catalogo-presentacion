
// FormBackupManager: gestiona copias locales de formularios (solo habilitado si APP_CONFIG.habilitarRespaldoFormularios)
(function(window) {
    function isEnabled() {
    try {
      const enabled = !!(window.APP_CONFIG && window.APP_CONFIG.habilitarRespaldoFormularios && window.localStorage);
      return enabled;
    } catch (error) {
      return false;
    }
  }

  function getStorageKey(formType, idRegistro) {
    return `${formType}.json:${idRegistro || 'desconocido'}`;
  }

  function getMetadataKey(formType, idRegistro) {
    return `${getStorageKey(formType, idRegistro)}:meta`; // meta key mantiene sufijo :meta
  }

  function saveBackup({ formType, srigId, idRegistro, payload, updatedAt }) {
    if (!isEnabled()) return;
    const key = getStorageKey(formType, idRegistro);
    const metaKey = getMetadataKey(formType, idRegistro);
    try {
      const timestamp = updatedAt || Date.now();
      const meta = {
        idRegistro,
        srigId,
        updatedAt: timestamp,
        formType
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
      window.localStorage.setItem(metaKey, JSON.stringify(meta));
    } catch (error) {
    }
  }

  function getBackup({ formType, idRegistro }) {
    if (!isEnabled()) return null;
    const key = getStorageKey(formType, idRegistro);
    const metaKey = getMetadataKey(formType, idRegistro);
    try {
      const raw = window.localStorage.getItem(key);
      const metaRaw = window.localStorage.getItem(metaKey);
      if (!raw || !metaRaw) return null;
      const payload = JSON.parse(raw);
      const meta = JSON.parse(metaRaw);
      return { payload, meta };
    } catch (error) {
      return null;
    }
  }

  function clearBackup({ formType, idRegistro }) {
    if (!isEnabled()) return;
    const key = getStorageKey(formType, idRegistro);
    const metaKey = getMetadataKey(formType, idRegistro);
    window.localStorage.removeItem(key);
    window.localStorage.removeItem(metaKey);
  }

  function compareTimestamps(metaLocal, metaRemote) {
    const localTime = metaLocal?.updatedAt ? Number(metaLocal.updatedAt) : 0;
    const remoteTime = metaRemote?.updatedAt ? Number(metaRemote.updatedAt) : 0;
    if (!localTime) return 'remote-newer';
    if (!remoteTime) return 'local-newer';
    if (localTime > remoteTime) return 'local-newer';
    if (localTime < remoteTime) return 'remote-newer';
    return 'equal';
  }

  window.FormBackupManager = {
    isEnabled,
    saveBackup,
    getBackup,
    clearBackup,
    compareTimestamps,
  };
})(window);
