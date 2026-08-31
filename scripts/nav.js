document.addEventListener("DOMContentLoaded", () => {
    const chatMode = String(window.COMMON_TABLE_CHAT_MODE || "beta").toLowerCase();
    const chatEndpoint = String(window.COMMON_TABLE_CHAT_ENDPOINT || "").trim();
    const chatSettings = window.COMMON_TABLE_CHAT_SETTINGS || null;
    const chatlingConfig = window.COMMON_TABLE_CHATLING || null;

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

    if (chatMode === "chatling") {
        const loaded = initChatling(chatlingConfig);
        if (!loaded) {
            initChatUI({ mode: "beta", endpoint: "", settings: chatSettings });
        }
    } else {
        initChatUI({ mode: chatMode, endpoint: chatEndpoint, settings: chatSettings });
    }
    initRelatedRecipes();
    enhanceRecipeStructuredData();
    initShareCopyButtons();
    initCollectionGrid();
    initNavDropdown();
    initMealRoulette();
});

function initMealRoulette() {
    const track = document.getElementById("rouletteTrack");
    if (!track) return;

    const regenerateBtn = document.getElementById("rouletteRegenerate");
    const statusEl = document.getElementById("rouletteStatus");
    const countValueEl = document.getElementById("rouletteCount");
    const decreaseBtn = document.getElementById("rouletteDecrease");
    const increaseBtn = document.getElementById("rouletteIncrease");
    const groceryBtn = document.getElementById("rouletteGroceryBtn");
    const groceryPanel = document.getElementById("groceryList");
    const groceryBody = document.getElementById("groceryListBody");
    const groceryCopyBtn = document.getElementById("groceryCopyBtn");
    const groceryCloseBtn = document.getElementById("groceryCloseBtn");
    const MIN_SLOTS = 2;
    const MAX_SLOTS = 7;
    const DEFAULT_SLOTS = 5;

    let allRecipes = [];
    let slots = [];
    let locked = [];
    let servings = [];
    let slotCount = DEFAULT_SLOTS;

    const lockIconOpen = '<path d="M8 11V7a4 4 0 0 1 7.2-2.4"/><rect x="5" y="11" width="14" height="10" rx="2"/>';
    const lockIconClosed = '<path d="M8 11V7a4 4 0 0 1 8 0v4"/><rect x="5" y="11" width="14" height="10" rx="2"/>';

    // --- Grocery list: ingredient parsing + merging ---------------------
    // Ingredient lines are free text ("500g chicken thigh", "1 onion, diced").
    // To combine matching ingredients across recipes we parse a leading
    // quantity + known unit, then group by a normalized ingredient name.
    // Anything that can't be parsed or matched cleanly is left alone rather
    // than guessed at, so the list never shows a fabricated total.
    const UNIT_TABLE = {
        g: { family: "mass", toBase: 1 },
        gram: { family: "mass", toBase: 1 },
        grams: { family: "mass", toBase: 1 },
        kg: { family: "mass", toBase: 1000 },
        ml: { family: "liquid", toBase: 1 },
        l: { family: "liquid", toBase: 1000 },
        tsp: { family: "volume", toBase: 1 },
        tsps: { family: "volume", toBase: 1 },
        teaspoon: { family: "volume", toBase: 1 },
        teaspoons: { family: "volume", toBase: 1 },
        tbsp: { family: "volume", toBase: 3 },
        tbsps: { family: "volume", toBase: 3 },
        tablespoon: { family: "volume", toBase: 3 },
        tablespoons: { family: "volume", toBase: 3 },
        cup: { family: "volume", toBase: 48 },
        cups: { family: "volume", toBase: 48 },
        clove: { family: "clove", toBase: 1 },
        cloves: { family: "clove", toBase: 1 },
        can: { family: "can", toBase: 1 },
        cans: { family: "can", toBase: 1 },
    };
    const ATTACHED_UNITS = ["g", "kg", "ml", "l"];
    const FRACTION_CHARS = { "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };

    function parseIngredientLine(rawLine) {
        const raw = rawLine.trim();
        let text = raw.replace(/[½¼¾⅓⅔⅛⅜⅝⅞]/g, ch => ` ${FRACTION_CHARS[ch]} `).replace(/\s+/g, " ").trim();

        let quantity = null;
        let approx = false;
        let rest = text;

        const slashMatch = text.match(/^(\d+)\s*\/\s*(\d+)\b\s*(.*)$/);
        const leadMatch = text.match(/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(.*)$/);

        if (slashMatch) {
            quantity = parseInt(slashMatch[1], 10) / parseInt(slashMatch[2], 10);
            rest = slashMatch[3];
        } else if (leadMatch) {
            const a = parseFloat(leadMatch[1]);
            const b = leadMatch[2] ? parseFloat(leadMatch[2]) : null;
            if (b !== null) {
                quantity = (a + b) / 2;
                approx = true;
            } else {
                quantity = a;
            }
            rest = leadMatch[3];
        }

        if (quantity === null) {
            return { quantity: null, unit: null, unitFamily: null, name: text, raw, approx: false };
        }

        rest = rest.trim();
        const unitMatch = rest.match(/^([a-zA-Z]+)\b\.?\s*(.*)$/);
        let unit = null;
        let unitFamily = null;
        let name = rest;

        if (unitMatch && UNIT_TABLE[unitMatch[1].toLowerCase()]) {
            unit = unitMatch[1].toLowerCase();
            unitFamily = UNIT_TABLE[unit].family;
            name = unitMatch[2].trim();
        } else {
            // "3 garlic cloves, minced" (noun-then-unit order) should merge
            // the same as "5 cloves garlic, minced" — reinterpret it here.
            const garlicMatch = name.match(/^garlic\s+cloves?\b\.?\s*,?\s*(.*)$/i);
            if (garlicMatch) {
                unit = "clove";
                unitFamily = "clove";
                name = garlicMatch[1] ? `garlic, ${garlicMatch[1]}` : "garlic";
            }
        }

        return { quantity, unit, unitFamily, name, raw, approx };
    }

    const IRREGULAR_SINGULARS = { leaves: "leaf" };

    function singularizeWord(word) {
        if (IRREGULAR_SINGULARS[word]) return IRREGULAR_SINGULARS[word];
        if (word.length <= 3) return word;
        if (/[^aeiou]oes$/.test(word)) return word.slice(0, -2);
        if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`;
        if (/ss$/.test(word)) return word;
        if (/s$/.test(word)) return word.slice(0, -1);
        return word;
    }

    const OES_PLURALS = new Set(["potato", "tomato"]);

    function pluralizeWord(word) {
        if (OES_PLURALS.has(word)) return `${word}es`;
        if (/(ch|sh|x|s)$/.test(word)) return `${word}es`;
        if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`;
        return `${word}s`;
    }

    // Uncountable nouns that show up as bare-count "1 handful X" style
    // ingredients — "4 baby spinaches" isn't a real word, it's just spinach.
    const UNCOUNTABLE_WORDS = new Set([
        "spinach", "rice", "quinoa", "cheese", "flour", "sugar",
        "yogurt", "yoghurt", "cornstarch", "honey", "kimchi",
    ]);

    function pluralizeName(coreName, count) {
        if (Math.round(count * 100) / 100 === 1) return coreName;
        const words = coreName.split(" ");
        const last = words.pop();
        words.push(UNCOUNTABLE_WORDS.has(last) ? last : pluralizeWord(last));
        return words.join(" ");
    }

    // Leading qualifiers that describe a size, prep step, or a loose
    // quantity word — not a different product. "large cucumber" and
    // "cucumber" are the same shopping item, so these get stripped before
    // matching. Colour/variety words (red onion, Dutch carrots, baby
    // spinach) are deliberately NOT in this list — those really are
    // different things to buy.
    // "diced", "crushed" and "peeled" are deliberately left out — for
    // canned goods those words mark a genuinely different product (canned
    // whole peeled tomatoes vs fresh tomatoes), not just a prep step.
    const CORE_NAME_STRIP_WORDS = new Set([
        "large", "small", "medium", "extra", "whole", "fresh", "ripe",
        "chopped", "sliced", "minced", "grated",
        "handful", "handfuls", "pinch", "squeeze", "thinly", "finely", "roughly", "of",
    ]);

    // Trailing words that describe a FORM of the same product you'd still
    // buy as one thing — "lemon juice" and "lemon wedges" both start with
    // you buying a lemon, so they collapse to "lemon" rather than sitting
    // as separate, easy-to-miss lines.
    const CORE_NAME_TRAILING_STRIP_WORDS = new Set(["juice", "juiced", "wedge", "wedges", "zest", "piece", "pieces"]);

    // Some spices are written both bare ("1 tsp cumin") and with an
    // explicit "ground" prefix ("2 tsp ground cumin") in different recipes
    // — same jar. Ginger and coriander are deliberately NOT here: in this
    // recipe set a bare mention of either always means the fresh form,
    // which really is a different product to the ground spice.
    const GROUND_SPICE_SYNONYMS = new Set(["cumin", "cinnamon", "turmeric"]);

    function normalizeCoreName(name) {
        // Strip parenthetical asides first — they can contain their own
        // commas (e.g. "(boneless, skinless)"), which would otherwise
        // truncate the name at the wrong comma.
        let core = name.replace(/\([^)]*\)/g, "").split(",")[0].trim().toLowerCase().replace(/&/g, "and");
        // "X or water" — water isn't something anyone needs to shop for, so
        // "chicken stock or water" is really just "chicken stock".
        core = core.replace(/\bor water$/, "").trim();
        // Spelling variant, same product.
        core = core.replace(/\byoghurt\b/g, "yogurt");

        let words = core.split(/\s+/).filter(Boolean);
        const wordSet = new Set(words);
        if (wordSet.has("garlic") && (wordSet.has("clove") || wordSet.has("cloves")) && words.length <= 3) {
            return "garlic";
        }
        while (words.length > 1 && CORE_NAME_STRIP_WORDS.has(words[0])) {
            words = words.slice(1);
        }
        while (words.length > 1 && CORE_NAME_TRAILING_STRIP_WORDS.has(words[words.length - 1])) {
            words = words.slice(0, -1);
        }

        const result = words.map(singularizeWord).join(" ").trim();
        return GROUND_SPICE_SYNONYMS.has(result) ? `ground ${result}` : result;
    }

    // A literal ingredient dump isn't a shopping list. Salt & pepper are a
    // near-universal pantry item no one needs reminding to buy, so they're
    // dropped entirely. Cooking oils and butter show up under half a dozen
    // slightly different names across recipes (olive oil, neutral oil,
    // extra virgin olive oil, butter or olive oil...) — rather than list
    // each variant separately (or wrongly sum incompatible fats into one
    // fake total), they're collapsed into a single reminder line.
    const PANTRY_EXCLUDE_PATTERNS = [
        /^salt$/, /^pepper$/, /^black pepper$/,
        /^salt and pepper$/, /^salt and black pepper$/,
    ];
    const PANTRY_COLLAPSE_RULES = [
        { test: /\boil\b/, label: "Cooking oil" },
        { test: /\bbutter\b/, label: "Butter" },
    ];

    function applyPantryRules(parsed) {
        const coreName = normalizeCoreName(parsed.name || parsed.raw);

        if (PANTRY_EXCLUDE_PATTERNS.some(re => re.test(coreName))) {
            return null;
        }

        const collapse = PANTRY_COLLAPSE_RULES.find(rule => rule.test.test(coreName));
        if (collapse) {
            return { quantity: null, unit: null, unitFamily: null, name: collapse.label, raw: collapse.label, approx: false };
        }

        return parsed;
    }

    function trimNum(n) {
        return (Math.round(n * 100) / 100).toString();
    }

    // Raw math can land on numbers like "19.67 cloves" that no one would
    // actually shop for. Round to what you'd realistically buy: whole units
    // for discrete things (cloves, cans, veg you buy by the piece), nearest
    // quarter for spoon/cup measures, and whole grams/ml for mass or liquid
    // (kg/L keep one decimal since those numbers are already small).
    function roundForDisplay(value, familyKey, unit) {
        if (familyKey === "volume") return Math.round(value * 4) / 4;
        if (familyKey === "mass" || familyKey === "liquid") {
            return unit === "kg" || unit === "l" ? Math.round(value * 10) / 10 : Math.round(value);
        }
        // clove, can, bare count (familyKey null/"count") — round up so a
        // merged total never leaves you short at the shops.
        return Math.ceil(value - 1e-9);
    }

    function formatSingleItem(parsed, multiplier) {
        if (multiplier === 1 || parsed.quantity === null) return parsed.raw;
        const scaledQty = parsed.quantity * multiplier;
        const prefix = parsed.approx ? "~" : "";
        const qtyStr = trimNum(roundForDisplay(scaledQty, parsed.unitFamily, parsed.unit));
        if (!parsed.unit) {
            return `${prefix}${qtyStr} ${parsed.name}`.replace(/\s+/g, " ").trim();
        }
        const spacer = ATTACHED_UNITS.includes(parsed.unit) ? "" : " ";
        return `${prefix}${qtyStr}${spacer}${parsed.unit} ${parsed.name}`.replace(/\s+/g, " ").trim();
    }

    function formatMergedQuantity(totalBase, familyKey, coreName, approx) {
        const prefix = approx ? "~" : "";
        let qtyStr;
        let displayName = coreName;

        if (familyKey === "mass") {
            const useKg = totalBase >= 1000;
            const value = roundForDisplay(useKg ? totalBase / 1000 : totalBase, familyKey, useKg ? "kg" : "g");
            qtyStr = useKg ? `${trimNum(value)}kg` : `${trimNum(value)}g`;
        } else if (familyKey === "liquid") {
            const useL = totalBase >= 1000;
            const value = roundForDisplay(useL ? totalBase / 1000 : totalBase, familyKey, useL ? "l" : "ml");
            qtyStr = useL ? `${trimNum(value)}L` : `${trimNum(value)}ml`;
        } else if (familyKey === "volume") {
            if (totalBase >= 48) {
                const value = roundForDisplay(totalBase / 48, familyKey);
                qtyStr = `${trimNum(value)} cup${value !== 1 ? "s" : ""}`;
            } else if (totalBase >= 3) {
                qtyStr = `${trimNum(roundForDisplay(totalBase / 3, familyKey))} tbsp`;
            } else {
                qtyStr = `${trimNum(roundForDisplay(totalBase, familyKey))} tsp`;
            }
        } else if (familyKey === "clove") {
            const value = roundForDisplay(totalBase, familyKey);
            qtyStr = `${trimNum(value)} clove${value !== 1 ? "s" : ""}`;
        } else if (familyKey === "can") {
            const value = roundForDisplay(totalBase, familyKey);
            qtyStr = `${trimNum(value)} can${value !== 1 ? "s" : ""}`;
        } else {
            const value = roundForDisplay(totalBase, familyKey);
            qtyStr = trimNum(value);
            displayName = pluralizeName(coreName, value);
        }

        return `${prefix}${qtyStr} ${displayName}`.replace(/\s+/g, " ").trim();
    }

    function mergeIngredients(entries) {
        // Group by ingredient name ONLY first, so "800g carrots" and
        // "1 carrot" always end up on the same list row — even though they
        // can't be added together as a single number (different units).
        // Within that row, items are summed wherever their units actually
        // allow it (a second family/unit bucket), and just shown side by
        // side otherwise, rather than left as two separate checkboxes for
        // the same thing.
        const outerGroups = new Map();

        entries.forEach(({ parsed, multiplier }) => {
            const coreName = normalizeCoreName(parsed.name || parsed.raw);
            if (!outerGroups.has(coreName)) outerGroups.set(coreName, []);
            outerGroups.get(coreName).push({ ...parsed, multiplier });
        });

        const results = [];
        outerGroups.forEach((items, coreName) => {
            const buckets = new Map();
            items.forEach(item => {
                const bucketKey = item.quantity !== null ? (item.unitFamily || "count") : "text";
                if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
                buckets.get(bucketKey).push(item);
            });

            const parts = [];
            buckets.forEach((bucketItems, bucketKey) => {
                if (bucketKey === "text") {
                    const seen = new Set();
                    bucketItems.forEach(item => {
                        if (!seen.has(item.raw)) {
                            seen.add(item.raw);
                            parts.push(item.raw);
                        }
                    });
                    return;
                }

                if (bucketItems.length === 1) {
                    parts.push(formatSingleItem(bucketItems[0], bucketItems[0].multiplier));
                    return;
                }

                let totalBase = 0;
                let approx = false;
                bucketItems.forEach(item => {
                    const scaled = item.quantity * item.multiplier;
                    const toBase = item.unit && UNIT_TABLE[item.unit] ? UNIT_TABLE[item.unit].toBase : 1;
                    totalBase += scaled * toBase;
                    if (item.approx) approx = true;
                });
                parts.push(formatMergedQuantity(totalBase, bucketKey, coreName, approx));
            });

            const isCanned = items.some(item => item.unit === "can" || item.unit === "cans");
            results.push({ display: parts.join(" + "), sortKey: coreName, category: categorizeIngredient(coreName, isCanned) });
        });

        return results.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }

    // Aisle-style sections so the list reads like something you'd actually
    // shop from, not an alphabetical dump. Order matters — more specific
    // rules run first so e.g. "chicken stock" lands in Pantry, not Meat,
    // and "ground ginger" (a spice) doesn't get caught by the fresh-ginger
    // veg rule below it.
    const GROCERY_SECTIONS = ["Fruit & Veg", "Meat & Seafood", "Dairy & Eggs", "Spices & Seasoning", "Pantry"];
    const CATEGORY_RULES = [
        { name: "Pantry", test: /\b(stock|broth|paste|sauce|vinegar|wine|canned|peeled tomato|tortilla|breadcrumb|flour|sugar|honey|rice|pasta|noodle|spaghetti|rigatoni|orzo|pappardelle|taco shell|bay leaf|cornstarch|mayo|mustard|chipotle|gochujang|kimchi|pickle|water|coconut|oil|curry paste|shell)\b/ },
        { name: "Dairy & Eggs", test: /\b(egg|cheese|feta|parmesan|pecorino|mozzarella|yog(h)?urt|cream|butter|milk)\b/ },
        // "oregano" is deliberately not listed here — it's sold both fresh
        // and dried, and the "dried"/"ground" prefixes already catch the
        // spice-rack version, so bare "oregano" falls through to the herb
        // rule under Fruit & Veg instead.
        { name: "Spices & Seasoning", test: /\b(ground|powder|cumin|paprika|turmeric|cinnamon|cayenne|garam masala|chilli flake|cardamom|nutmeg|dried|spice|herb)\b/ },
        { name: "Meat & Seafood", test: /\b(beef|mince|steak|chuck|short rib|chicken|thigh|breast|lamb|pork|bacon|chorizo|sausage|prawn|salmon|fish|guanciale|pancetta)\b/ },
        { name: "Fruit & Veg", test: /\b(onion|garlic|carrot|potato|capsicum|cucumber|tomato|lettuce|spinach|cabbage|broccolini?|avocado|lemon|lime|mango|ginger|chilli|chili|coriander|parsley|mint|basil|oregano|dill|bean|spring onion|pomegranate|corn|edamame|squash|sweet potato)\b/ },
    ];

    function categorizeIngredient(coreName, isCanned) {
        // A canned good is Pantry no matter what the ingredient itself is —
        // canned black beans/tomatoes live in a different aisle to the
        // fresh version the keyword rules below would otherwise match.
        if (isCanned) return "Pantry";
        const rule = CATEGORY_RULES.find(r => r.test.test(coreName));
        return rule ? rule.name : "Pantry";
    }

    function shuffle(array) {
        const copy = [...array];
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function usedUrls() {
        return slots.filter(Boolean).map(recipe => recipe.url);
    }

    function fillSlots(isInitial) {
        const lockedUrls = slots
            .filter((recipe, i) => locked[i] && recipe)
            .map(recipe => recipe.url);

        const neededCount = isInitial ? slotCount : locked.filter(l => !l).length;

        if (!isInitial && neededCount === 0) {
            if (statusEl) statusEl.textContent = "Every slot is locked — unlock one to reshuffle it.";
            return;
        }

        const pool = allRecipes.filter(r => !lockedUrls.includes(r.url));
        let picks = shuffle(pool).slice(0, neededCount);

        // If the site ever has fewer recipes than slots, top up by re-allowing
        // repeats rather than leaving slots empty.
        if (picks.length < neededCount) {
            const extra = shuffle(allRecipes).slice(0, neededCount - picks.length);
            picks = picks.concat(extra);
        }

        if (isInitial) {
            slots = new Array(slotCount).fill(null);
            locked = new Array(slotCount).fill(false);
            servings = new Array(slotCount).fill(null);
        }

        let pickIndex = 0;
        for (let i = 0; i < slotCount; i += 1) {
            if (isInitial || !locked[i]) {
                slots[i] = picks[pickIndex];
                servings[i] = picks[pickIndex].servings;
                pickIndex += 1;
            }
        }

        if (statusEl) statusEl.textContent = "";
        render();
    }

    function changeSlotCount(delta) {
        const newCount = slotCount + delta;
        if (newCount < MIN_SLOTS || newCount > MAX_SLOTS) return;

        if (delta > 0) {
            const newRecipe = shuffle(allRecipes.filter(r => !usedUrls().includes(r.url)))[0]
                || shuffle(allRecipes)[0];
            slots.push(newRecipe);
            locked.push(false);
            servings.push(newRecipe.servings);
        } else {
            slots.pop();
            locked.pop();
            servings.pop();
        }

        slotCount = newCount;
        if (statusEl) statusEl.textContent = "";
        render();
    }

    function render() {
        if (countValueEl) countValueEl.textContent = slotCount;
        if (decreaseBtn) decreaseBtn.disabled = slotCount <= MIN_SLOTS;
        if (increaseBtn) increaseBtn.disabled = slotCount >= MAX_SLOTS;

        track.innerHTML = slots.map((recipe, i) => {
            if (!recipe) return "";
            const lockedClass = locked[i] ? " locked" : "";
            const lockIcon = locked[i] ? lockIconClosed : lockIconOpen;
            const servingCount = servings[i] || recipe.servings;
            return `
                <div class="roulette-slot${lockedClass}">
                    <a class="roulette-slot-link" href="${recipe.url}">
                        <img class="roulette-slot-image" src="${recipe.image || 'images/placeholder.png'}" alt="${recipe.title}" loading="lazy">
                        <div class="roulette-slot-overlay">
                            <h3 class="roulette-slot-title">${recipe.title}</h3>
                        </div>
                    </a>
                    <button type="button" class="roulette-lock-btn" data-slot-index="${i}" aria-pressed="${locked[i]}" aria-label="${locked[i] ? "Unlock" : "Lock"} ${recipe.title}">
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8">${lockIcon}</svg>
                    </button>
                    <div class="roulette-slot-servings">
                        <button type="button" class="roulette-slot-serving-btn" data-slot-index="${i}" data-action="dec" aria-label="Fewer servings for ${recipe.title}">−</button>
                        <span class="roulette-slot-serving-value">${servingCount}</span>
                        <button type="button" class="roulette-slot-serving-btn" data-slot-index="${i}" data-action="inc" aria-label="More servings for ${recipe.title}">+</button>
                    </div>
                </div>
            `;
        }).join("");

        if (groceryPanel && !groceryPanel.hidden) renderGroceryList();
    }

    function buildIngredientEntries() {
        const entries = [];
        slots.forEach((recipe, i) => {
            if (!recipe) return;
            const baseServings = recipe.servings || 1;
            const multiplier = (servings[i] || baseServings) / baseServings;
            (recipe.ingredients || []).forEach(line => {
                const parsed = applyPantryRules(parseIngredientLine(line));
                if (!parsed) return;
                entries.push({ parsed, multiplier });
            });
        });
        return entries;
    }

    function groupBySection(merged) {
        const bySection = new Map();
        merged.forEach(item => {
            if (!bySection.has(item.category)) bySection.set(item.category, []);
            bySection.get(item.category).push(item);
        });
        return GROCERY_SECTIONS
            .map(name => ({ name, items: bySection.get(name) || [] }))
            .filter(section => section.items.length > 0);
    }

    function renderGroceryList() {
        if (!groceryBody) return;
        const merged = mergeIngredients(buildIngredientEntries());

        if (merged.length === 0) {
            groceryBody.innerHTML = '<p class="grocery-empty">No recipes to list yet.</p>';
            return;
        }

        groceryBody.innerHTML = groupBySection(merged).map(section => `
            <div class="grocery-section">
                <h3 class="grocery-section-heading">${section.name}</h3>
                <ul class="grocery-items">
                    ${section.items.map(item => `
                        <li class="grocery-item">
                            <label>
                                <input type="checkbox">
                                <span>${item.display}</span>
                            </label>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `).join("");
    }

    function groceryListText() {
        const merged = mergeIngredients(buildIngredientEntries());
        return groupBySection(merged)
            .map(section => `${section.name}\n${section.items.map(item => `- ${item.display}`).join("\n")}`)
            .join("\n\n");
    }

    if (groceryBtn && groceryPanel) {
        groceryBtn.addEventListener("click", () => {
            const willOpen = groceryPanel.hidden;
            if (willOpen) {
                renderGroceryList();
                groceryPanel.hidden = false;
                groceryBtn.setAttribute("aria-expanded", "true");
                groceryBtn.textContent = "Hide Grocery List";
                groceryPanel.scrollIntoView({ behavior: "smooth", block: "start" });
            } else {
                groceryPanel.hidden = true;
                groceryBtn.setAttribute("aria-expanded", "false");
                groceryBtn.textContent = "Grocery List";
            }
        });
    }

    if (groceryCloseBtn && groceryPanel) {
        groceryCloseBtn.addEventListener("click", () => {
            groceryPanel.hidden = true;
            if (groceryBtn) {
                groceryBtn.setAttribute("aria-expanded", "false");
                groceryBtn.textContent = "Grocery List";
            }
        });
    }

    if (groceryBody) {
        groceryBody.addEventListener("change", (event) => {
            const checkbox = event.target.closest('input[type="checkbox"]');
            if (!checkbox) return;
            const item = checkbox.closest(".grocery-item");
            if (item) item.classList.toggle("checked", checkbox.checked);
        });
    }

    if (groceryCopyBtn) {
        groceryCopyBtn.addEventListener("click", async () => {
            const text = groceryListText();
            const originalLabel = groceryCopyBtn.textContent;
            try {
                await navigator.clipboard.writeText(text);
                groceryCopyBtn.textContent = "Copied!";
            } catch (error) {
                console.error("Unable to copy grocery list", error);
                groceryCopyBtn.textContent = "Couldn't copy";
            }
            setTimeout(() => { groceryCopyBtn.textContent = originalLabel; }, 1500);
        });
    }

    track.addEventListener("click", (event) => {
        const lockBtn = event.target.closest(".roulette-lock-btn");
        if (lockBtn) {
            event.preventDefault();
            const index = parseInt(lockBtn.dataset.slotIndex, 10);
            locked[index] = !locked[index];
            render();
            return;
        }

        const servingBtn = event.target.closest(".roulette-slot-serving-btn");
        if (servingBtn) {
            event.preventDefault();
            const index = parseInt(servingBtn.dataset.slotIndex, 10);
            const delta = servingBtn.dataset.action === "inc" ? 1 : -1;
            servings[index] = Math.max(1, (servings[index] || 1) + delta);
            render();
        }
    });

    if (regenerateBtn) {
        regenerateBtn.addEventListener("click", () => fillSlots(false));
    }

    if (decreaseBtn) {
        decreaseBtn.addEventListener("click", () => changeSlotCount(-1));
    }

    if (increaseBtn) {
        increaseBtn.addEventListener("click", () => changeSlotCount(1));
    }

    document.addEventListener("keydown", (event) => {
        if (event.code !== "Space") return;
        const target = event.target;
        const isTyping = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
        if (isTyping) return;
        event.preventDefault();
        fillSlots(false);
    });

    fetch("recipes/recipes.json", { cache: "no-store" })
        .then(response => {
            if (!response.ok) throw new Error(`Recipe index request failed: ${response.status}`);
            return response.json();
        })
        .then(recipes => {
            allRecipes = recipes;
            fillSlots(true);
        })
        .catch(error => {
            console.error("Unable to load meal planner recipes", error);
            if (statusEl) statusEl.textContent = "Couldn't load recipes right now — try refreshing the page.";
        });
}

function initNavDropdown() {
    // Panels are siblings of .nav-links (not nested inside it), so they aren't
    // clipped by .nav-links' overflow-x:auto on mobile. Trigger and panel are
    // linked via aria-controls / id rather than DOM nesting.
    const triggers = Array.from(document.querySelectorAll(".nav-dropdown-trigger"));
    if (triggers.length === 0) return;

    const pairs = triggers
        .map(trigger => {
            const panelId = trigger.getAttribute("aria-controls");
            const panel = panelId ? document.getElementById(panelId) : null;
            return panel ? { trigger, panel } : null;
        })
        .filter(Boolean);

    const closeAll = () => {
        pairs.forEach(({ trigger, panel }) => {
            panel.classList.remove("open");
            trigger.setAttribute("aria-expanded", "false");
        });
    };

    pairs.forEach(({ trigger, panel }) => {
        trigger.addEventListener("click", (event) => {
            event.preventDefault();
            const willOpen = !panel.classList.contains("open");
            closeAll();
            if (willOpen) {
                panel.classList.add("open");
                trigger.setAttribute("aria-expanded", "true");
            }
        });
    });

    document.addEventListener("click", (event) => {
        const openPair = pairs.find(({ panel }) => panel.classList.contains("open"));
        if (openPair && !openPair.panel.contains(event.target) && !openPair.trigger.contains(event.target)) {
            closeAll();
        }
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeAll();
    });
}

function initCollectionGrid() {
    const grid = document.getElementById("collectionGrid");
    if (!grid) return;

    const config = window.COMMON_TABLE_COLLECTION || {};

    fetch("recipes/recipes.json", { cache: "no-store" })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Recipe index request failed: ${response.status}`);
            }
            return response.json();
        })
        .then(recipes => {
            const matches = recipes
                .filter(recipe => collectionMatches(recipe, config))
                .sort((a, b) => a.title.localeCompare(b.title));

            const countEl = document.getElementById("collectionCount");
            if (countEl) {
                countEl.textContent = `${matches.length} recipe${matches.length === 1 ? "" : "s"}`;
            }

            if (matches.length === 0) {
                grid.innerHTML = '<p class="no-results">No recipes match this collection yet.</p>';
                return;
            }

            matches.forEach(recipe => {
                grid.appendChild(createCollectionRecipeCard(recipe));
            });
        })
        .catch(error => {
            console.error("Unable to load collection recipes", error);
        });
}

function collectionMatches(recipe, config) {
    if (config.tag) {
        return (recipe.tags || []).includes(config.tag);
    }
    if (config.maxServings) {
        return typeof recipe.servings === "number" && recipe.servings <= config.maxServings;
    }
    return false;
}

function createCollectionRecipeCard(recipe) {
    const card = document.createElement("a");
    card.className = "recipe-card";
    card.href = recipe.url;

    const primaryTag = (recipe.tags || [])[0] || "Recipe";
    const displayTag = primaryTag.charAt(0).toUpperCase() + primaryTag.slice(1);

    card.innerHTML = `
        <img src="${recipe.image || 'images/placeholder.png'}" alt="${recipe.title}" class="recipe-image" loading="lazy">
        <div class="recipe-content">
            <h3>${recipe.title}</h3>
            <p>${recipe.excerpt || ""}</p>
            <div class="collection-recipe-meta">${recipe.time || ""}</div>
            <span class="tag">${displayTag}</span>
        </div>
    `;

    return card;
}

function initShareCopyButtons() {
    document.querySelectorAll("[data-share-copy]").forEach(btn => {
        const originalLabel = btn.querySelector(".share-btn-label");
        if (!originalLabel) return;
        const defaultText = originalLabel.textContent;

        btn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(window.location.href);
                originalLabel.textContent = "Copied!";
            } catch (_error) {
                originalLabel.textContent = "Couldn't copy";
            }
            setTimeout(() => {
                originalLabel.textContent = defaultText;
            }, 1800);
        });
    });
}

function initChatling(config) {
    const chatbotId = String(config?.chatbotId || "").trim();
    const scriptSrc = String(config?.scriptSrc || "https://chatling.ai/js/embed.js").trim();

    if (!chatbotId || chatbotId === "REPLACE_WITH_CHATLING_CHATBOT_ID") {
        console.warn("Chatling mode is enabled but chatbotId is missing. Falling back to internal chat.");
        return false;
    }

    window.chtlConfig = {
        chatbotId
    };

    if (document.getElementById("chtl-script") || document.getElementById("chatling-embed-script")) {
        return true;
    }

    const script = document.createElement("script");
    script.async = true;
    script.id = "chtl-script";
    script.setAttribute("data-id", chatbotId);
    script.type = "text/javascript";
    script.src = scriptSrc;
    document.body.appendChild(script);
    return true;
}

function enhanceRecipeStructuredData() {
    if (!window.location.pathname.includes("/recipes/") && !window.location.pathname.includes("/Recipe%20Project/test/recipes/")) {
        return;
    }

    const recipeScript = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).find(script => {
        const content = script.textContent || "";
        return content.includes('"@type": "Recipe"') || content.includes('"@type":"Recipe"');
    });

    if (!recipeScript) return;

    let recipeData;
    try {
        recipeData = JSON.parse(recipeScript.textContent);
    } catch (error) {
        console.error("Unable to parse recipe structured data", error);
        return;
    }

    const recipeUrl = getCanonicalUrl();
    const recipeImage = getRecipeImageUrl(recipeData);

    if (!recipeData.keywords) {
        const derivedKeywords = buildRecipeKeywords(recipeData);
        if (derivedKeywords.length > 0) {
            recipeData.keywords = derivedKeywords.join(", ");
        }
    }

    if (!recipeData.nutrition) {
        const nutrition = extractNutritionFromPage();
        if (nutrition) {
            recipeData.nutrition = nutrition;
        }
    }

    if (Array.isArray(recipeData.recipeInstructions)) {
        recipeData.recipeInstructions = enrichRecipeInstructions(recipeData.recipeInstructions, recipeUrl, recipeImage);
    }

    recipeScript.textContent = `${JSON.stringify(recipeData, null, 2)}\n`;
}

function getCanonicalUrl() {
    const canonical = document.querySelector('link[rel="canonical"]');
    return canonical ? canonical.href : window.location.href.split("#")[0];
}

function getRecipeImageUrl(recipeData) {
    if (typeof recipeData.image === "string" && recipeData.image.length > 0) {
        return recipeData.image;
    }

    if (Array.isArray(recipeData.image) && recipeData.image.length > 0) {
        return recipeData.image[0];
    }

    const metaImage = document.querySelector('meta[property="og:image"]');
    return metaImage ? metaImage.content : "";
}

function buildRecipeKeywords(recipeData) {
    const rawKeywords = [];

    rawKeywords.push(recipeData.name || "");
    rawKeywords.push(recipeData.recipeCuisine || "");
    rawKeywords.push(recipeData.recipeCategory || "");

    (recipeData.recipeIngredient || []).slice(0, 8).forEach(ingredient => {
        rawKeywords.push(String(ingredient).replace(/^[0-9./]+\s*[a-zA-Z()%-]*\s*/u, "").trim());
    });

    const seen = new Set();
    return rawKeywords
        .map(keyword => String(keyword || "").replace(/\s+/g, " ").trim())
        .filter(keyword => keyword.length > 1)
        .filter(keyword => {
            const normalized = keyword.toLowerCase();
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });
}

function extractNutritionFromPage() {
    const macrosHeading = Array.from(document.querySelectorAll(".section-title")).find(heading =>
        heading.textContent && ["macros", "nutrition"].some(term => heading.textContent.toLowerCase().includes(term))
    );

    if (!macrosHeading) return null;

    const macrosList = macrosHeading.nextElementSibling;
    if (!macrosList || macrosList.tagName !== "UL") return null;

    const nutrition = {
        "@type": "NutritionInformation"
    };

    macrosList.querySelectorAll("li").forEach(item => {
        const label = item.querySelector("strong");
        const key = label ? label.textContent.toLowerCase().replace(/:$/, "").trim() : "";
        const value = item.textContent.replace(label ? label.textContent : "", "").trim();

        if (!key || !value) return;

        if (key === "calories") nutrition.calories = value;
        if (key === "protein") nutrition.proteinContent = value;
        if (key === "carbs") nutrition.carbohydrateContent = value;
        if (key === "fats") nutrition.fatContent = value;
        if (key === "fiber" || key === "fibre") nutrition.fiberContent = value;
    });

    return Object.keys(nutrition).length > 1 ? nutrition : null;
}

function enrichRecipeInstructions(instructions, recipeUrl, recipeImage) {
    const stepElements = Array.from(document.querySelectorAll(".container ol li"));

    return instructions.map((instruction, index) => {
        const source = typeof instruction === "string"
            ? { "@type": "HowToStep", text: instruction }
            : { ...instruction };

        const stepElement = stepElements[index] || null;
        const stepText = normalizeStepText(source.text || (stepElement ? stepElement.textContent : ""));
        const stepName = source.name || extractStepName(stepElement, stepText, index);
        const stepUrl = `${recipeUrl}#step-${index + 1}`;

        if (stepElement && !stepElement.id) {
            stepElement.id = `step-${index + 1}`;
        }

        return {
            "@type": "HowToStep",
            name: stepName,
            text: stepText,
            url: source.url || stepUrl,
            ...(source.image || recipeImage ? { image: source.image || recipeImage } : {})
        };
    });
}

function normalizeStepText(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
}

function extractStepName(stepElement, stepText, index) {
    const strong = stepElement ? stepElement.querySelector("strong") : null;
    if (strong && strong.textContent.trim().length > 0) {
        return strong.textContent.replace(/:$/, "").trim();
    }

    const leadingClause = stepText.split(":")[0].trim();
    if (leadingClause && leadingClause.length <= 80 && leadingClause !== stepText) {
        return leadingClause;
    }

    const words = stepText.split(/\s+/).filter(Boolean).slice(0, 6);
    if (words.length > 0) {
        return words.join(" ");
    }

    return `Step ${index + 1}`;
}

function initRelatedRecipes() {
    if (!window.location.pathname.includes("/recipes/") && !window.location.pathname.includes("/Recipe%20Project/test/recipes/")) {
        return;
    }

    if (document.querySelector(".related-recipes")) return;

    const recipeContainer = document.querySelector(".container");
    const recipeHero = document.querySelector(".recipe-hero");

    if (!recipeContainer || !recipeHero) return;

    const currentBasename = window.location.pathname.split("/").pop();

    fetch("recipes.json", { cache: "no-store" })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Recipe index request failed: ${response.status}`);
            }
            return response.json();
        })
        .then(recipes => {
            const currentRecipe = recipes.find(recipe => getRecipeBasename(recipe.url) === currentBasename);
            if (!currentRecipe) return;

            const relatedRecipes = recipes
                .filter(recipe => getRecipeBasename(recipe.url) !== currentBasename)
                .map(recipe => ({ recipe, score: getRelatedRecipeScore(currentRecipe, recipe) }))
                .filter(entry => entry.score > 0)
                .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title))
                .slice(0, 3)
                .map(entry => entry.recipe);

            const fallbackRecipes = recipes
                .filter(recipe => getRecipeBasename(recipe.url) !== currentBasename)
                .slice(0, 3);

            const recipesToRender = relatedRecipes.length > 0 ? relatedRecipes : fallbackRecipes;
            if (recipesToRender.length === 0) return;

            const section = document.createElement("section");
            section.className = "related-recipes";
            section.innerHTML = `
                <h2 class="section-title">Related Recipes</h2>
                <p class="related-recipes-intro">Keep cooking with a few similar dishes from the same part of the site.</p>
                <div class="recipe-grid"></div>
            `;

            const grid = section.querySelector(".recipe-grid");
            recipesToRender.forEach(recipe => {
                grid.appendChild(createRelatedRecipeCard(recipe));
            });

            recipeContainer.appendChild(section);
        })
        .catch(error => {
            console.error("Unable to load related recipes", error);
        });
}

function getRecipeBasename(recipeUrl) {
    return String(recipeUrl || "").split("/").pop();
}

function getRelatedRecipeScore(currentRecipe, candidateRecipe) {
    let score = 0;

    if ((currentRecipe.category || "") === (candidateRecipe.category || "")) {
        score += 4;
    }

    const currentTags = new Set(currentRecipe.tags || []);
    (candidateRecipe.tags || []).forEach(tag => {
        if (currentTags.has(tag)) score += 1;
    });

    return score;
}

function createRelatedRecipeCard(recipe) {
    const card = document.createElement("a");
    card.className = "recipe-card related-recipe-card";
    card.href = getRecipeBasename(recipe.url);

    const imageSrc = recipe.image ? `../${String(recipe.image).replace(/^\.\//, "")}` : "../images/placeholder.png";
    const primaryTag = (recipe.tags || [])[0] || "Recipe";
    const displayTag = primaryTag.charAt(0).toUpperCase() + primaryTag.slice(1);

    card.innerHTML = `
        <img src="${imageSrc}" alt="${recipe.title}" class="recipe-image" loading="lazy">
        <div class="recipe-content">
            <h3>${recipe.title}</h3>
            <p>${recipe.excerpt || ""}</p>
            <div class="related-recipe-meta">${recipe.time || ""}</div>
            <span class="tag">${displayTag}</span>
        </div>
    `;

    return card;
}

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
