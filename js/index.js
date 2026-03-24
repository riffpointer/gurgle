let crazy_mode = false;

// I know, it also contains some jokes.
// But it's Gurgle, what do ya expect!?
const quotes = [
    "eef freef",
    "LMAO",
    "hi lol",
    "Breaking Bad or Badking Break?",
    "Which vitamin is the safest? B-9",
    "What's worse than lobsters on your piano? Crabs on your organ!",
    "Why was 6 afraid of 7? 6 7!!!!!",
    "How was the skeleton able to afford college? It scared the management team.",
    "Nothing is impossible unless you can't do it.",
    "Sometimes when I close my eyes, J U A N.",
    "The more you know, the less you more.",
    "Ye Bourself.",
    "If you can’t convince them, confuse them!",
    "If were you I, I rather me be would.",
    "Feter Farker",
    "You don't give up, matter.",
    "Scniece."
];

const showError = (err) => {
    alert("Error: " + err);
    console.error(err);
}

const requestFullscreen = (element) => {
    if (!element)
        return;

    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else {
        showError("Fullscreen API not supported by your browser.");
    }
};

const randomColor = () => {
    const r = Math.floor(Math.random() * 256);
    const g = Math.floor(Math.random() * 256);
    const b = Math.floor(Math.random() * 256);
    return `rgb(${r}, ${g}, ${b})`;
};

const checkNewYear = () => {
    const now = new Date();
    if (now.getMonth() === 0 && now.getDate() === 1) {
        query(".pyro").style.display = "block";
    }
};

window.addEventListener("DOMContentLoaded", () => {
    const gurgle_logo = fromId("gurgle-logo");
    const date_today = new Date();
    const date_today_string = `${date_today.getDate()}/${date_today.getMonth() + 1}/${date_today.getFullYear()}`;
    gurgle_logo.title = `Welcome to Gurgle! (Today is ${date_today_string})\nToday's quote: ${quotes[Math.floor(Math.random() * quotes.length)]}`;

    setupAutocomplete(fromId("q"), ".homepage-search-shell");

    const gurgle_counter_element = fromId("gurgle-counter");
    let gurgle_counter = 1500400;
    let gurgle_counting = true;

    setInterval(() => {
        if (gurgle_counting) {
            gurgle_counter += 10;
            gurgle_counter_element.innerHTML = gurgle_counter.toLocaleString();

            if (gurgle_counter > 1e+10) {
                gurgle_counting = false;
            }
        }
    }, 50);

    const warningDialog = fromId("warning-dialog");
    const yesButton = fromId("yes-button");
    const noButton = fromId("no-button");
    const dialogOverlay = query(".dialog-overlay");
    const pyro = query(".pyro");
    const crazyButton = fromId("crazy");

    yesButton.addEventListener("click", () => {
        requestFullscreen(query("html"));
        query("body").classList.add("go-crazy");
        pyro.style.display = "block";
        warningDialog.style.display = "none";
        dialogOverlay.style.display = "none";
        crazy_mode = true;
        document.addEventListener("keydown", () => {
            if (crazy_mode) {
                document.body.style.backgroundColor = `${randomColor()} !important`;
            }
        });
    });

    noButton.addEventListener("click", () => {
        warningDialog.style.display = "none";
        dialogOverlay.style.display = "none";
    });

    crazyButton.addEventListener("click", () => {
        warningDialog.style.display = "block";
        dialogOverlay.style.display = "block";
    });

    checkNewYear();
});
