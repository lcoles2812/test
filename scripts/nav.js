document.addEventListener("DOMContentLoaded", () => {
    const chatMode = String(window.COMMON_TABLE_CHAT_MODE || "beta").toLowerCase();
    const chatEndpoint = String(window.COMMON_TABLE_CHAT_ENDPOINT || "").trim();
    const chatSettings = window.COMMON_TABLE_CHAT_SETTINGS || null;

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

    initChatUI({ mode: chatMode, endpoint: chatEndpoint, settings: chatSettings });
});

function initChatUI(config) {
    if (document.querySelector(".chat-fab")) return;

    const root = document.createElement("div");
    root.className = "chat-widget";
    root.innerHTML = `
        <button class="chat-fab" type="button" aria-label="Open chat" aria-expanded="false">Chat</button>
        <section class="chat-panel" aria-hidden="true">
            <header class="chat-header">
                <div>
                    <strong>Common Table Chat</strong>
                    <p class="chat-mode-label"></p>
                </div>
                <button class="chat-close" type="button" aria-label="Close chat">×</button>
            </header>
            <div class="chat-messages" role="log" aria-live="polite"></div>
            <form class="chat-form">
                <input class="chat-input" type="text" placeholder="Ask for recipes, swaps, or ideas..." maxlength="240" />
                <button class="chat-send" type="submit">Send</button>
            </form>
        </section>
    `;

    document.body.appendChild(root);

    const fab = root.querySelector(".chat-fab");
    const panel = root.querySelector(".chat-panel");
    const closeBtn = root.querySelector(".chat-close");
    const messages = root.querySelector(".chat-messages");
    const form = root.querySelector(".chat-form");
    const input = root.querySelector(".chat-input");
    const sendBtn = root.querySelector(".chat-send");
    const modeLabel = root.querySelector(".chat-mode-label");

    const isGeminiMode = config.mode === "gemini";
    let useEndpoint = isGeminiMode && config.endpoint.length > 0;
    const updateModeLabel = () => {
        modeLabel.textContent = useEndpoint ? "Gemini live mode" : "Frontend beta mode";
    };
    updateModeLabel();

    const addMessage = (role, text) => {
        const el = document.createElement("div");
        el.className = `chat-msg ${role}`;
        el.textContent = text;
        messages.appendChild(el);
        messages.scrollTop = messages.scrollHeight;
    };

    const cannedReply = (message) => {
        const q = message.toLowerCase();
        if (q.includes("quick") || q.includes("fast")) {
            return "Try searching Quick tags on the homepage: poke bowl, prawn pasta, chicken burger, and drunken noodles are good starts.";
        }
        if (q.includes("high protein") || q.includes("protein")) {
            return "High-protein options include chicken tikka, burrito bowl, poke bowl, korean fried chicken, and lamb pitta.";
        }
        if (q.includes("meal prep")) {
            return "Great meal prep picks: burrito bowl, sticky beef mince, and panang curry.";
        }
        if (q.includes("swap") || q.includes("substitute")) {
            return "Easy swaps: chicken thigh to breast for leaner meals, yogurt sauce for lighter creaminess, and air-fry instead of deep fry where suitable.";
        }
        if (q.includes("lamb") || q.includes("pitta")) {
            return "For lamb pitta, use BBQ for char or oven for convenience, then serve with homemade tzatziki and tomato-cucumber salad.";
        }
        return "This is a free frontend beta chat. For now I can give quick recipe guidance and swap ideas based on your site content.";
    };

    const fetchGeminiReply = async (message) => {
        const payload = {
            message,
            settings: config.settings || undefined
        };

        const response = await fetch(config.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Chat request failed: ${response.status}`);
        }

        const data = await response.json();
        return data.reply || data.text || "I got your message, but I could not format a reply.";
    };

    const setBusy = (busy) => {
        input.disabled = busy;
        sendBtn.disabled = busy;
        sendBtn.textContent = busy ? "..." : "Send";
    };

    const openChat = () => {
        panel.classList.add("open");
        panel.setAttribute("aria-hidden", "false");
        fab.setAttribute("aria-expanded", "true");
        if (!messages.hasChildNodes()) {
            const intro = useEndpoint
                ? "Hi. I am connected in live mode. Ask about recipes, swaps, or meal ideas."
                : "Hi. Ask me for recipe ideas, quick options, or ingredient swaps.";
            addMessage("assistant", intro);
        }
        input.focus();
    };

    const closeChat = () => {
        panel.classList.remove("open");
        panel.setAttribute("aria-hidden", "true");
        fab.setAttribute("aria-expanded", "false");
    };

    fab.addEventListener("click", () => {
        if (panel.classList.contains("open")) {
            closeChat();
        } else {
            openChat();
        }
    });

    closeBtn.addEventListener("click", closeChat);

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        addMessage("user", text);
        input.value = "";

        if (useEndpoint) {
            setBusy(true);
            try {
                const reply = await fetchGeminiReply(text);
                addMessage("assistant", reply);
            } catch (err) {
                console.error(err);
                useEndpoint = false;
                updateModeLabel();
                addMessage("assistant", "Live mode is unavailable right now, so I have switched to beta mode.");
                addMessage("assistant", cannedReply(text));
            } finally {
                setBusy(false);
            }
            return;
        }

        window.setTimeout(() => {
            addMessage("assistant", cannedReply(text));
        }, 250);
    });

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && panel.classList.contains("open")) {
            closeChat();
        }
    });
}
