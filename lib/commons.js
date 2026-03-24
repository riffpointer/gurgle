const url_params = new Proxy(new URLSearchParams(window.location.search), {
    get: (searchParams, prop) => searchParams.get(prop),
});

const fromId = (id) => document.getElementById(id)
const query = (qs) => document.querySelector(qs)
const queryAll = (qs) => document.querySelectorAll(qs)

const shuffle = (array) => {
    // https://javascript.info/task/shuffle
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

const initDarkMode = () => {
    const isDark = localStorage.getItem('darkMode') === 'true';
    if (isDark) {
        document.documentElement.classList.add('dark-mode');
        document.body.classList.add('dark-mode');
    }
    
    const toggle = document.createElement('button');
    toggle.className = 'dark-mode-toggle';
    toggle.id = 'dark-mode-toggle';
    toggle.setAttribute('aria-label', 'Toggle dark mode');
    
    const updateIcon = (dark) => {
        toggle.innerHTML = dark 
            ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="currentColor" d="M124 40V16a4 4 0 0 1 8 0v24a4 4 0 0 1-8 0m64 88a60 60 0 1 1-60-60a60.07 60.07 0 0 1 60 60m-8 0a52 52 0 1 0-52 52a52.06 52.06 0 0 0 52-52M61.17 66.83a4 4 0 0 0 5.66-5.66l-16-16a4 4 0 0 0-5.66 5.66Zm0 122.34l-16 16a4 4 0 0 0 5.66 5.66l16-16a4 4 0 0 0-5.66-5.66M192 68a4 4 0 0 0 2.83-1.17l16-16a4 4 0 1 0-5.66-5.66l-16 16A4 4 0 0 0 192 68m2.83 121.17a4 4 0 0 0-5.66 5.66l16 16a4 4 0 0 0 5.66-5.66ZM40 124H16a4 4 0 0 0 0 8h24a4 4 0 0 0 0-8m88 88a4 4 0 0 0-4 4v24a4 4 0 0 0 8 0v-24a4 4 0 0 0-4-4m112-88h-24a4 4 0 0 0 0 8h24a4 4 0 0 0 0-8"/></svg>`
            : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><path fill="currentColor" d="M230.72 145.06a4 4 0 0 0-4-1A92.08 92.08 0 0 1 111.94 29.27a4 4 0 0 0-5-5a100.78 100.78 0 0 0-50.86 35.61a100 100 0 0 0 140 140a100.78 100.78 0 0 0 35.59-50.87a4 4 0 0 0-.95-3.95m-39.42 48.47A92 92 0 0 1 62.47 64.7a93 93 0 0 1 39.88-30.35a100.09 100.09 0 0 0 119.3 119.3a93 93 0 0 1-30.35 39.88"/></svg>`;
    };
    
    updateIcon(isDark);
    
    toggle.addEventListener('click', () => {
        const currentlyDark = document.body.classList.toggle('dark-mode');
        document.documentElement.classList.toggle('dark-mode');
        localStorage.setItem('darkMode', currentlyDark);
        updateIcon(currentlyDark);
    });
    
    document.body.appendChild(toggle);
}

const setupAutocomplete = async (input, containerSelector) => {
    let queries = [];
    try {
        const response = await fetch('data/fake_queries.csv');
        const text = await response.text();
        queries = text.split('\n').map(q => q.trim()).filter(q => q.length > 0);
    } catch (e) {
        console.error("Failed to load autocomplete queries", e);
        return;
    }

    const container = query(containerSelector);
    const dropdown = document.createElement('div');
    dropdown.className = container.classList.contains('homepage-search-shell')
        ? 'search-suggestions-dropdown'
        : 'autocomplete-dropdown';
    container.appendChild(dropdown);
    const suggestionLimit = container.parentElement
        ? (container.parentElement.querySelector('.gurgle-buttons') ? 6 : 10)
        : 10;

    const buttonRow = container.parentElement
        ? container.parentElement.querySelector('.gurgle-buttons')
        : null;
    const buttonRowParent = buttonRow ? buttonRow.parentNode : null;
    const buttonRowNextSibling = buttonRow ? buttonRow.nextSibling : null;

    const placeButtonRow = (insideContainer) => {
        if (!buttonRow || !buttonRowParent) {
            return;
        }

        if (insideContainer) {
            if (buttonRow.parentNode !== dropdown) {
                dropdown.appendChild(buttonRow);
            }
            return;
        }

        if (buttonRow.parentNode === buttonRowParent) {
            return;
        }

        if (buttonRowNextSibling && buttonRowNextSibling.parentNode === buttonRowParent) {
            buttonRowParent.insertBefore(buttonRow, buttonRowNextSibling);
        } else {
            buttonRowParent.appendChild(buttonRow);
        }
    };

    const searchIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5S14 7.01 14 9.5S11.99 14 9.5 14"/></svg>`;
    let suggestionItems = [];
    let activeSuggestionIndex = -1;

    const setActiveSuggestion = (index) => {
        if (!suggestionItems.length) {
            activeSuggestionIndex = -1;
            return;
        }

        const nextIndex = ((index % suggestionItems.length) + suggestionItems.length) % suggestionItems.length;
        activeSuggestionIndex = nextIndex;
        suggestionItems.forEach((item, itemIndex) => {
            const isActive = itemIndex === activeSuggestionIndex;
            item.classList.toggle('autocomplete-active', isActive);
            item.setAttribute('aria-selected', isActive ? 'true' : 'false');
            if (isActive) {
                item.scrollIntoView({ block: 'nearest' });
            }
        });
    };

    const clearActiveSuggestion = () => {
        activeSuggestionIndex = -1;
        suggestionItems.forEach((item) => {
            item.classList.remove('autocomplete-active');
            item.setAttribute('aria-selected', 'false');
        });
    };

    const chooseSuggestion = (q) => {
        input.value = q;
        dropdown.style.display = 'none';
        container.classList.remove('autocomplete-open');
        placeButtonRow(false);
        clearActiveSuggestion();
        input.form.submit();
    };

    const renderResults = (filtered) => {
        dropdown.innerHTML = '';
        suggestionItems = [];
        clearActiveSuggestion();
        if (filtered.length > 0) {
            filtered.forEach(q => {
                const item = document.createElement('div');
                item.className = container.classList.contains('homepage-search-shell')
                    ? 'search-suggestion'
                    : 'autocomplete-item';
                item.setAttribute('role', 'option');
                item.setAttribute('aria-selected', 'false');
                item.dataset.value = q;
                
                let val = input.value.toLowerCase();
                let highlighted = q;
                const index = q.toLowerCase().indexOf(val);
                if (val && index !== -1) {
                    const before = q.substring(0, index);
                    const match = q.substring(index, index + val.length);
                    const after = q.substring(index + val.length);
                    highlighted = `${before}<b>${match}</b>${after}`;
                }

                item.innerHTML = `<span class="${container.classList.contains('homepage-search-shell') ? 'search-suggestion-icon' : 'autocomplete-icon'}">${searchIcon}</span><span>${highlighted}</span>`;
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    chooseSuggestion(q);
                });
                item.addEventListener('mouseenter', () => {
                    const itemIndex = suggestionItems.indexOf(item);
                    if (itemIndex !== -1) {
                        setActiveSuggestion(itemIndex);
                    }
                });
                dropdown.appendChild(item);
                suggestionItems.push(item);
            });
            dropdown.style.display = 'block';
            container.classList.add('autocomplete-open');
            placeButtonRow(true);
        } else {
            dropdown.style.display = 'none';
            container.classList.remove('autocomplete-open');
            placeButtonRow(false);
        }
    };

    const moveSuggestionSelection = (delta) => {
        if (!dropdown || dropdown.style.display === 'none' || !suggestionItems.length) {
            return false;
        }

        const nextIndex = activeSuggestionIndex === -1
            ? (delta > 0 ? 0 : suggestionItems.length - 1)
            : activeSuggestionIndex + delta;

        setActiveSuggestion(nextIndex);
        return true;
    };

    input.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
            if (moveSuggestionSelection(1)) {
                event.preventDefault();
            }
        } else if (event.key === 'ArrowUp') {
            if (moveSuggestionSelection(-1)) {
                event.preventDefault();
            }
        } else if (event.key === 'Enter' && activeSuggestionIndex >= 0 && suggestionItems[activeSuggestionIndex]) {
            event.preventDefault();
            chooseSuggestion(suggestionItems[activeSuggestionIndex].dataset.value || suggestionItems[activeSuggestionIndex].innerText.trim());
        } else if (event.key === 'Escape') {
            clearActiveSuggestion();
        }
    });

    input.addEventListener('input', () => {
        const val = input.value.toLowerCase();
        activeSuggestionIndex = -1;
        if (!val) {
            const random = [...queries].sort(() => 0.5 - Math.random()).slice(0, suggestionLimit);
            renderResults(random);
            return;
        }
        const filtered = queries.filter(q => q.toLowerCase().includes(val)).slice(0, suggestionLimit);
        renderResults(filtered);
    });

    input.addEventListener('focus', () => {
        const val = input.value.toLowerCase();
        activeSuggestionIndex = -1;
        if (!val) {
            const random = [...queries].sort(() => 0.5 - Math.random()).slice(0, suggestionLimit);
            renderResults(random);
        } else {
            const filtered = queries.filter(q => q.toLowerCase().includes(val)).slice(0, suggestionLimit);
            renderResults(filtered);
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            dropdown.style.display = 'none';
            container.classList.remove('autocomplete-open');
            placeButtonRow(false);
        }, 200);
    });
}

const checkShrugTrigger = () => {
    const q = url_params.q;
    if (!q) return;
    const triggers = [/^\s*6\s*7\s*$/i, /^\s*67\s*$/i, /^\s*six\s*seven\s*$/i, /^\s*six\s*7\s*$/i, /^\s*6\s*seven\s*$/i];
    if (triggers.some(re => re.test(q))) {
        document.body.classList.add('shrug-animation');
    }
}

const ads = [
    { title: "FREE SKIBIDI TOILET", content: "Get your free skibidi toilet now! Only 5 left in stock in Ohio!", btn: "GET GYATT", img: "img/ads/skibidi.gif" },
    { title: "HOT TUNG TUNG SAHURS", content: "Hot tung tung sahurs in your area! Wake up for sahur with a bass boosted remix!", btn: "SAHURRR", img: "img/ads/tung.gif" },
    { title: "FANUM TAX REFUND", content: "Did you overpay your Fanum Tax? Get an immediate refund of 5000 Aura!", btn: "CLAIM AURA", img: "img/ads/aura.gif" },
    { title: "BECOME SIGMA OVERNIGHT", content: "Tired of being an NPC? Use our patented Mewing Tape while you sleep!", btn: "BYE BYE", img: "img/ads/mew.gif" },
    { title: "KAI CENAT CALLED YOU", content: "Kai Cenat is on the line! He wants to invite you to the next subathon!", btn: "PICK UP", img: "img/ads/kai_cenat.gif" },
    { title: "GRIMACE SHAKE DELIVERY", content: "Your Grimace Shake is here. Drink it. Don't ask any questions.", btn: "GLUG GLUG", img: "img/ads/grimace.gif" },
    { title: "OHIO STATE PASSPORT", content: "Apply for your Ohio State Passport now to bypass the Final Boss!", btn: "LEVEL UP", img: "img/ads/ohio.gif" },
    { title: "UNLIMITED RIZZ GLITCH", content: "Use this one simple glitch to get infinite rizz in 2026! (NO CAP)", btn: "RIZZ ME", img: "img/ads/w_rizz.gif" },
    { title: "IS HOW SPEED BARKING?", content: "Watch IShowSpeed bark at a wall for 10 hours straight! LIVE NOW!", btn: "WOOF WOOF", img: "img/ads/speed.gif" },
    { title: "AURA GENERATOR 3000", content: "Is your Aura level too low? Use our cloud-based Aura Generator!", btn: "STAY COLD", img: "img/ads/aura2.gif" }
];

const makeDraggable = (element) => {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    let rotation = 0;
    let lastX = 0;

    const onMouseDown = (e) => {
        if (e.target.classList.contains('ad-close') || e.target.classList.contains('ad-btn')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = element.offsetLeft;
        initialTop = element.offsetTop;
        lastX = e.clientX;
        element.style.zIndex = 10000;
        e.preventDefault();
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        element.style.left = `${initialLeft + dx}px`;
        element.style.top = `${initialTop + dy}px`;

        const velocityX = e.clientX - lastX;
        lastX = e.clientX;

        const targetRotation = Math.max(-30, Math.min(30, velocityX * 2));
        rotation += (targetRotation - rotation) * 0.1;
        element.style.transform = `rotate(${rotation}deg)`;
    };

    const onMouseUp = () => {
        if (!isDragging) return;
        isDragging = false;
        
        const settle = setInterval(() => {
            rotation *= 0.9;
            element.style.transform = `rotate(${rotation}deg)`;
            if (Math.abs(rotation) < 0.1) {
                clearInterval(settle);
                element.style.transform = `rotate(0deg)`;
            }
        }, 20);
    };

    element.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
};

const requestFullscreen = (element) => {
    if (!element) return;
    if (element.requestFullscreen) {
        element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
    }
};

let openAdsCount = 0;
let isGsodTriggered = false;

const spawnAd = () => {
    if (isGsodTriggered) return;

    openAdsCount++;
    if (openAdsCount > 20) {
        isGsodTriggered = true;
        
        // Go fullscreen first
        requestFullscreen(document.documentElement);
        
        document.body.classList.add('glitch-mode');
        
        setTimeout(() => {
            document.body.classList.remove('glitch-mode');
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            
            const gsod = fromId('gsod');
            if (gsod) {
                gsod.style.display = 'flex';
                
                // Progress logic
                const progressEl = gsod.querySelector('.gsod-progress');
                let progress = 0;
                let direction = 1; 
                let n = 1;
                let increment = 1;

                const interval = setInterval(() => {
                    if (direction === 1) {
                        progress += Math.floor(Math.random() * 10) + 5;
                        if (progress >= 100) {
                            progress = 100;
                            direction = -1;
                        }
                    } else {
                        // Count backwards infinitely with accelerating speed
                        progress -= increment;
                        increment += n;
                        n *= 1.5;
                    }
                    progressEl.textContent = `${Math.floor(progress)}% complete`;
                }, 800);
            }
        }, 1000);
        return;
    }

    const ad = ads[Math.floor(Math.random() * ads.length)];
    const div = document.createElement('div');
    div.className = 'annoying-ad';
    
    const colors = ['#39FF14', '#FF00FF', '#FFFF00', '#00FFFF', '#FF5F1F', '#FF0000', '#FFFFFF', '#00FF00', '#FAFF00'];
    div.style.background = colors[Math.floor(Math.random() * colors.length)];
    
    // Header color
    const headerColors = ['#000080', '#ff0000', '#008000', '#800080', '#808000', '#008080', '#000000'];
    const selectedHeaderColor = headerColors[Math.floor(Math.random() * headerColors.length)];

    const fonts = ['', 'ad-font-papyrus', 'ad-font-impact', 'ad-font-serif'];
    const shapes = ['', 'ad-shape-round', 'ad-shape-blob'];
    const anims = ['', '', 'ad-style-wiggle', 'ad-style-bounce', 'ad-style-spring']; 
    const borders = ['', 'ad-border-flash'];

    const selectedFont = fonts[Math.floor(Math.random() * fonts.length)];
    const selectedShape = shapes[Math.floor(Math.random() * shapes.length)];
    const selectedAnim = anims[Math.floor(Math.random() * anims.length)];
    const selectedBorder = borders[Math.floor(Math.random() * borders.length)];

    if (selectedFont) div.classList.add(selectedFont);
    if (selectedShape) div.classList.add(selectedShape);
    if (selectedAnim) div.classList.add(selectedAnim);
    if (selectedBorder) div.classList.add(selectedBorder);

    const width = 250 + Math.random() * 200;
    div.style.width = `${width}px`;
    
    const x = Math.random() * (window.innerWidth - width);
    const y = Math.random() * (window.innerHeight - 350);
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    
    if (selectedAnim !== 'ad-style-spring') {
        const rotation = (Math.random() - 0.5) * 40;
        div.style.transform = `rotate(${rotation}deg)`;
    }

    const hasHeader = Math.random() > 0.3;
    const headerHtml = hasHeader ? `
        <div class="ad-header" style="background: ${selectedHeaderColor}">
            <span>${ad.title}</span>
            <div class="ad-close">X</div>
        </div>
    ` : `<div class="ad-close" style="position:absolute; top:5px; right:5px;">X</div>`;

    const imgHtml = ad.img ? `<img src="${ad.img}" class="ad-image" alt="brainrot">` : '';

    div.innerHTML = `
        ${headerHtml}
        <div class="ad-content">
            <h3 class="ad-blink">${Math.random() > 0.5 ? '!!! ALERT !!!' : '!!! WINNER !!!'}</h3>
            ${imgHtml}
            <p>${ad.content}</p>
            <button class="ad-btn">${ad.btn}</button>
        </div>
    `;

    div.querySelector('.ad-close').onclick = () => {
        div.remove();
        openAdsCount--;
    };
    div.querySelector('.ad-btn').onclick = () => {
        const videos = [
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            'https://www.youtube.com/watch?v=L7ejl_Hj3A8',
            'https://www.youtube.com/watch?v=HmIMmFAV4BY'
        ];
        window.open(videos[Math.floor(Math.random() * videos.length)], '_blank');
        div.remove();
        openAdsCount--;
    };

    document.body.appendChild(div);
    makeDraggable(div);
};

const initAnnoyingAds = () => {
    // Only show ads on results page
    if (!window.location.pathname.includes('results.html')) return;

    setInterval(() => {
        if (Math.random() < 0.1) {
            spawnAd();
        }
    }, 1000);
};

const checkAmogusTrigger = () => {
    const q = url_params.q;
    if (!q) return false;
    const amogusRegex = /\b(among\s*us|amogus|amogs|amoguz)\b/i;
    return amogusRegex.test(q);
};

window.addEventListener('DOMContentLoaded', () => {
    initDarkMode();
    checkShrugTrigger();
    initAnnoyingAds();
});
