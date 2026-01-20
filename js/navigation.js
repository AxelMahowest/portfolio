// Mobile Navigation Handler
class MobileNav {
    constructor() {
        this.mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
        this.nav = document.querySelector('nav');
        this.navLinks = document.querySelectorAll('nav ul li a');
        this.body = document.body;
        this.html = document.documentElement;
        
        this.init();
    }
    
    init() {
        // Prevent horizontal scroll when nav is open
        this.preventHorizontalScroll();
        
        // Toggle menu
        this.mobileMenuToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });
        
        // Close menu when clicking nav links
        this.navLinks.forEach(link => {
            link.addEventListener('click', () => {
                this.closeMenu();
            });
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (this.nav.classList.contains('nav-open') && 
                !this.nav.contains(e.target) && 
                !this.mobileMenuToggle.contains(e.target)) {
                this.closeMenu();
            }
        });
        
        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.nav.classList.contains('nav-open')) {
                this.closeMenu();
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768 && this.nav.classList.contains('nav-open')) {
                this.closeMenu();
            }
        });
    }
    
    toggleMenu() {
        const isOpen = this.nav.classList.toggle('nav-open');
        this.mobileMenuToggle.classList.toggle('menu-open');
        
        if (isOpen) {
            this.lockScroll();
        } else {
            this.unlockScroll();
        }
    }
    
    closeMenu() {
        this.nav.classList.remove('nav-open');
        this.mobileMenuToggle.classList.remove('menu-open');
        this.unlockScroll();
    }
    
    lockScroll() {
        // Prevent body scroll and horizontal overflow
        this.body.style.overflow = 'hidden';
        this.body.style.position = 'fixed';
        this.body.style.width = '100%';
        this.body.style.height = '100%';
    }
    
    unlockScroll() {
        // Restore body scroll
        this.body.style.overflow = '';
        this.body.style.position = '';
        this.body.style.width = '';
        this.body.style.height = '';
    }
    
    preventHorizontalScroll() {
        // Ensure no horizontal scrolling on mobile
        this.body.style.overflowX = 'hidden';
        this.html.style.overflowX = 'hidden';
    }
}

// Skill bar animation
function animateSkillBars() {
    const skillBars = document.querySelectorAll('.skill-progress');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const skillBar = entry.target;
                const skillLevel = skillBar.getAttribute('data-skill');
                skillBar.style.width = skillLevel + '%';
                observer.unobserve(skillBar);
            }
        });
    }, {
        threshold: 0.5
    });

    skillBars.forEach(bar => {
        observer.observe(bar);
    });
}

// Image modal functions
function openModal(imageSrc, caption) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    const modalCaption = document.getElementById('modalCaption');
    
    modal.style.display = 'flex';
    modalImage.src = imageSrc;
    modalCaption.textContent = caption;
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('imageModal');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize mobile navigation
    new MobileNav();
    
    // Initialize skill bar animations
    animateSkillBars();
    
    // Modal event listeners
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    
    // Close modal on background click
    modal.addEventListener('click', closeModal);
    
    // Prevent modal from closing when clicking the image
    modalImage.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });
});