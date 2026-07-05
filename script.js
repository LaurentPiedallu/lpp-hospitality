const siteHeader = document.querySelector('.site-header');
if (siteHeader) {
  const applyNavState = () => siteHeader.classList.toggle('nav-solid', window.scrollY > 72);
  applyNavState();
  window.addEventListener('scroll', applyNavState, { passive: true });
}

const heroScroll = document.querySelector('.hero-scroll');
if (heroScroll) {
  const applyHeroScrollFade = () => {
    heroScroll.style.opacity = window.scrollY >= 80 ? '0' : '1';
  };
  applyHeroScrollFade();
  window.addEventListener('scroll', applyHeroScrollFade, { passive: true });
}

const toggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('.mobile-nav');
const year = document.querySelector('#year');

if (year) year.textContent = new Date().getFullYear();

if (toggle && mobileNav) {
  toggle.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  document.querySelectorAll('.mobile-nav a').forEach((link) => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const revealTargets = document.querySelectorAll('.section-inner, .problem-grid article, .engagement-list article, .approach-list article, .signal-item');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

revealTargets.forEach((target) => {
  target.classList.add('reveal');
  observer.observe(target);
});
