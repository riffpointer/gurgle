if (localStorage.getItem("darkMode") === "true") {
    document.documentElement.classList.add("dark-mode");
    document.addEventListener("DOMContentLoaded", () => {
        document.body.classList.add("dark-mode");
    });
}
