document.addEventListener("DOMContentLoaded", () => {
    const navs = Array.from(document.querySelectorAll("nav .nav-container"));

    navs.forEach(container => {
        const button = container.querySelector(".nav-toggle-btn");
        const links = container.querySelector(".nav-links");

        if (!button || !links) return;

        const closeMenu = () => {
            links.classList.remove("open");
            button.setAttribute("aria-expanded", "false");
        };

        const toggleMenu = () => {
            const isOpen = links.classList.toggle("open");
            button.setAttribute("aria-expanded", isOpen ? "true" : "false");
        };

        button.addEventListener("click", toggleMenu);

        links.querySelectorAll("a").forEach(link => {
            link.addEventListener("click", closeMenu);
        });

        document.addEventListener("keydown", e => {
            if (e.key === "Escape") closeMenu();
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth > 700) {
                closeMenu();
            }
        });
    });
});
