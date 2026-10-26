(function () {

    const MENU_URL = 'https://hernandovargaslo.github.io/ideca-menu-centralizado/menu.json';

    const menuContainer = document.getElementById('centralMenu');
    const menuWrapper = document.getElementById('navbarMenuOverlay');

    if (!menuContainer || !menuWrapper) {
        console.error('No se encontró #centralMenu o #navbarMenuOverlay');
        return;
    }

    async function loadMenu() {

        try {

            const response = await fetch(MENU_URL, {
                method: 'GET',
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(
                    `Error HTTP al cargar el menú: ${response.status}`
                );
            }

            const data = await response.json();

            if (!data || !Array.isArray(data.menu)) {
                throw new Error('La estructura del JSON no es válida');
            }

            renderMenu(data.menu);

            // Mostrar solamente si el menú se construyó correctamente
            menuWrapper.style.display = '';

        } catch (error) {

            console.error(
                'No fue posible cargar el menú centralizado:',
                error
            );

            menuContainer.innerHTML = '';
            menuWrapper.style.display = 'none';
        }
    }


    function renderMenu(items) {

        menuContainer.innerHTML = '';

        items.forEach(item => {

            const li = document.createElement('li');

            li.className = 'nav-item flex-fill';

            const hasChildren =
                Array.isArray(item.children) &&
                item.children.length > 0;

            if (hasChildren) {
                li.classList.add('dropdown');
            }


            // Enlace principal

            const link = document.createElement('a');

            link.className = 'nav-link';
            link.href = item.url;
            link.textContent = ` ${item.label} `;


            // Activo según la configuración del JSON

            if (isActive(item)) {

                link.classList.add('active');

                link.setAttribute(
                    'aria-current',
                    'page'
                );
            }


            if (hasChildren) {

                link.setAttribute(
                    'role',
                    'button'
                );

                link.setAttribute(
                    'aria-expanded',
                    'false'
                );
            }


            li.appendChild(link);


            // Submenú

            if (hasChildren) {

                const submenuId =
                    `submenu-${item.id}`;


                // Botón desplegable

                const button =
                    document.createElement('button');

                button.className =
                    'nav-dropdown-toggle';

                button.type = 'button';

                button.setAttribute(
                    'aria-expanded',
                    'false'
                );

                button.setAttribute(
                    'aria-controls',
                    submenuId
                );

                button.setAttribute(
                    'aria-label',
                    `Expandir ${item.label}`
                );


                const icon =
                    document.createElement('i');

                icon.className =
                    'fas fa-chevron-down';

                icon.setAttribute(
                    'aria-hidden',
                    'true'
                );

                button.appendChild(icon);

                li.appendChild(button);


                // Submenú UL

                const submenu =
                    document.createElement('ul');

                submenu.id = submenuId;

                submenu.className =
                    'dropdown-menu dropdown-menu-columns';


                if (item.dropdownClass) {

                    submenu.classList.add(
                        item.dropdownClass
                    );
                }


                item.children.forEach(child => {

                    const childLi =
                        document.createElement('li');

                    const childLink =
                        document.createElement('a');

                    childLink.className =
                        'dropdown-item';

                    childLink.href =
                        child.url;

                    childLink.textContent =
                        child.label;

                    childLi.appendChild(
                        childLink
                    );

                    submenu.appendChild(
                        childLi
                    );

                });


                li.appendChild(submenu);
            }


            menuContainer.appendChild(li);

        });


        initializeDropdowns();
    }


    function initializeDropdowns() {

        const buttons =
            document.querySelectorAll(
                '#centralMenu .nav-dropdown-toggle'
            );


        buttons.forEach(button => {

            button.addEventListener(
                'click',
                function () {

                    const expanded =
                        this.getAttribute(
                            'aria-expanded'
                        ) === 'true';


                    // Cerrar otros submenús

                    buttons.forEach(otherButton => {

                        if (otherButton !== this) {

                            otherButton.setAttribute(
                                'aria-expanded',
                                'false'
                            );


                            const otherMenuId =
                                otherButton.getAttribute(
                                    'aria-controls'
                                );


                            const otherMenu =
                                document.getElementById(
                                    otherMenuId
                                );


                            if (otherMenu) {

                                otherMenu.classList.remove(
                                    'show'
                                );
                            }
                        }

                    });


                    // Alternar actual

                    this.setAttribute(
                        'aria-expanded',
                        String(!expanded)
                    );


                    const menuId =
                        this.getAttribute(
                            'aria-controls'
                        );


                    const menu =
                        document.getElementById(
                            menuId
                        );


                    if (menu) {

                        menu.classList.toggle(
                            'show',
                            !expanded
                        );
                    }

                }
            );

        });
    }


    function isActive(item) {

    const current = new URL(window.location.href);

    // URL principal del elemento
    if (matchesUrl(current, item.url)) {
        return true;
    }

    // URLs adicionales definidas en activeWhen
    return (item.activeWhen || []).some(value => {
        return matchesUrl(current, value);
    });
}


function matchesUrl(current, target) {

    try {

        // Si es una ruta relativa
        if (target.startsWith('/')) {
            return current.pathname.startsWith(target);
        }

        const targetUrl = new URL(target);

        return (
            current.origin === targetUrl.origin &&
            current.pathname.startsWith(targetUrl.pathname)
        );

    } catch (error) {

        return false;

    }
}


    // Iniciar

    loadMenu();

})();