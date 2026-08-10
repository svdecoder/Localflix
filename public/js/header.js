function fetchHeader() {
    fetch("header.html").then(response => {
        if (!response.ok) {
            throw new Error("Something went wrong during the fetch of the header");
        }
        return response.text();
    }).then(data => {
        document.getElementById("header").innerHTML += data;
        initThemeToggle();
    }).catch(err => console.error("Header fetch failed:", err));
}

function initThemeToggle() {
    const STORAGE_KEY = "localflix-theme";

    // Apply saved theme or system preference on load
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light") {
        document.documentElement.setAttribute("data-theme", "light");
    } else if (saved === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
    } else {
        // Use system preference
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
            document.documentElement.setAttribute("data-theme", "light");
        } else {
            document.documentElement.setAttribute("data-theme", "dark");
        }
    }
    updateThemeIcon();

    // Listen for system preference changes
    if (window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
            if (!localStorage.getItem(STORAGE_KEY)) {
                document.documentElement.setAttribute("data-theme", e.matches ? "dark" : "light");
                updateThemeIcon();
            }
        });
    }

    // Toggle button
    const btn = document.getElementById("themeToggle");
    if (btn) {
        btn.addEventListener("click", () => {
            const current = document.documentElement.getAttribute("data-theme");
            const next = current === "light" ? "dark" : "light";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem(STORAGE_KEY, next);
            updateThemeIcon();
        });
    }
}

function updateThemeIcon() {
    const sun = document.getElementById("themeIconSun");
    const moon = document.getElementById("themeIconMoon");
    if (!sun || !moon) return;
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme === "light") {
        sun.style.display = "none";
        moon.style.display = "block";
    } else {
        sun.style.display = "block";
        moon.style.display = "none";
    }
}

window.addEventListener("DOMContentLoaded", fetchHeader);