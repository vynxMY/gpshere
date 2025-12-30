// Mobile Menu Toggle Functionality
// Add this to all dashboard pages

(function() {
    // Create sidebar overlay if it doesn't exist
    function createSidebarOverlay() {
        let overlay = document.querySelector('.sidebar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'sidebar-overlay';
            overlay.onclick = toggleMobileMenu;
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    // Toggle mobile menu
    function toggleMobileMenu() {
        const sidebar = document.querySelector('.sidebar');
        const overlay = createSidebarOverlay();
        
        if (sidebar) {
            sidebar.classList.toggle('show');
            overlay.classList.toggle('show');
            
            // Prevent body scroll when sidebar is open
            if (sidebar.classList.contains('show')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        }
    }

    // Close menu when clicking on sidebar links (mobile)
    function setupSidebarLinks() {
        const sidebarLinks = document.querySelectorAll('.sidebar-menu a');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', function() {
                // Only close on mobile
                if (window.innerWidth <= 768) {
                    toggleMobileMenu();
                }
            });
        });
    }

    // Create mobile menu toggle button if it doesn't exist
    function createMobileMenuButton() {
        let button = document.querySelector('.mobile-menu-toggle');
        if (!button) {
            const header = document.querySelector('.dashboard-header');
            if (header) {
                button = document.createElement('button');
                button.className = 'mobile-menu-toggle';
                button.innerHTML = '☰';
                button.setAttribute('aria-label', 'Toggle menu');
                button.onclick = toggleMobileMenu;
                
                // Insert at the beginning of header-actions or header
                const headerActions = header.querySelector('.header-actions');
                if (headerActions) {
                    headerActions.insertBefore(button, headerActions.firstChild);
                } else {
                    header.insertBefore(button, header.firstChild);
                }
            }
        }
        return button;
    }

    // Close menu on window resize (if resized to desktop)
    function handleResize() {
        if (window.innerWidth > 768) {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.querySelector('.sidebar-overlay');
            if (sidebar) sidebar.classList.remove('show');
            if (overlay) overlay.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            createMobileMenuButton();
            createSidebarOverlay();
            setupSidebarLinks();
            window.addEventListener('resize', handleResize);
        });
    } else {
        createMobileMenuButton();
        createSidebarOverlay();
        setupSidebarLinks();
        window.addEventListener('resize', handleResize);
    }

    // Export function for manual use
    window.toggleMobileMenu = toggleMobileMenu;
})();

