document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const userInput = document.getElementById("userInput");
    const charCount = document.getElementById("charCount");
    const clearBtn = document.getElementById("clearBtn");
    const analyzeBtn = document.getElementById("analyzeBtn");
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    const resultPlaceholder = document.getElementById("resultPlaceholder");
    const visualDashboard = document.getElementById("visualDashboard");
    const statTotalIntents = document.getElementById("statTotalIntents");
    const statExecutionOrder = document.getElementById("statExecutionOrder");
    const clarificationAlert = document.getElementById("clarificationAlert");
    const clarificationMsg = document.getElementById("clarificationMsg");
    const intentsContainer = document.getElementById("intentsContainer");
    const jsonOutput = document.getElementById("jsonOutput");
    const copyJsonBtn = document.getElementById("copyJsonBtn");
    const toast = document.getElementById("toast");
    const suggestChips = document.querySelectorAll(".suggest-chip");

    // Initialize character count
    userInput.addEventListener("input", () => {
        charCount.textContent = userInput.value.length;
    });

    // Clear input
    clearBtn.addEventListener("click", () => {
        userInput.value = "";
        charCount.textContent = 0;
        userInput.focus();
    });

    // Suggestion chips
    suggestChips.forEach(chip => {
        chip.addEventListener("click", () => {
            userInput.value = chip.getAttribute("data-text");
            charCount.textContent = userInput.value.length;
            userInput.focus();
        });
    });

    // Tab switching
    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            
            tabContents.forEach(content => {
                if (content.id === `${targetTab}Tab`) {
                    content.classList.add("active");
                } else {
                    content.classList.remove("active");
                }
            });
        });
    });

    // Copy JSON to clipboard
    copyJsonBtn.addEventListener("click", () => {
        const text = jsonOutput.textContent;
        navigator.clipboard.writeText(text).then(() => {
            toast.classList.remove("hidden");
            setTimeout(() => {
                toast.classList.add("hidden");
            }, 2000);
        });
    });

    // Analyze intent call
    analyzeBtn.addEventListener("click", async () => {
        const message = userInput.value.trim();
        if (!message) return;

        // Show loading state
        analyzeBtn.disabled = true;
        const originalBtnContent = analyzeBtn.innerHTML;
        analyzeBtn.innerHTML = `<span class="spinner"></span><span>Analyzing...</span>`;
        
        // Clear previous results or show loaders
        resultPlaceholder.innerHTML = `
            <span class="spinner" style="width:40px; height:40px; border-width:3px;"></span>
            <p style="margin-top: 1rem;">Ollama is processing the intent...</p>
        `;
        resultPlaceholder.classList.remove("hidden");
        visualDashboard.classList.add("hidden");

        try {
            const response = await fetch("/api/detect", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ message })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            renderResults(data);
        } catch (error) {
            console.error("Analysis failed:", error);
            renderError(error.message);
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = originalBtnContent;
        }
    });

    // Render success results
    function renderResults(data) {
        // Update raw JSON view
        jsonOutput.textContent = JSON.stringify(data, null, 2);

        // Check if there was an Ollama execution error returned inside JSON
        if (data.error) {
            renderError(data.clarification_message || data.error);
            return;
        }

        // Hide placeholder, show dashboard
        resultPlaceholder.classList.add("hidden");
        visualDashboard.classList.remove("hidden");

        // Set total intents count
        statTotalIntents.textContent = data.total_intents || 0;

        // Render Execution Order Flowchart
        statExecutionOrder.innerHTML = "";
        if (data.execution_order && data.execution_order.length > 0) {
            data.execution_order.forEach((step, idx) => {
                const stepEl = document.createElement("span");
                stepEl.className = "flow-step";
                stepEl.textContent = step;
                statExecutionOrder.appendChild(stepEl);

                if (idx < data.execution_order.length - 1) {
                    const arrowEl = document.createElement("span");
                    arrowEl.className = "flow-arrow";
                    arrowEl.innerHTML = "&rarr;";
                    statExecutionOrder.appendChild(arrowEl);
                }
            });
        } else {
            statExecutionOrder.innerHTML = `<span class="subtitle">No specific execution order provided.</span>`;
        }

        // Handle Clarification Alert
        if (data.clarification_message) {
            clarificationAlert.classList.remove("hidden");
            clarificationMsg.textContent = data.clarification_message;
        } else {
            clarificationAlert.classList.add("hidden");
        }

        // Render Intent Cards
        intentsContainer.innerHTML = "";
        if (data.intents && data.intents.length > 0) {
            data.intents.forEach(intent => {
                const card = document.createElement("div");
                card.className = `intent-card ${intent.needs_clarification ? 'warning-border' : ''}`;

                // Header
                const header = document.createElement("div");
                header.className = "intent-header";
                
                const titleBadge = document.createElement("span");
                titleBadge.className = "intent-title-badge";
                titleBadge.textContent = intent.intent;
                header.appendChild(titleBadge);

                // Confidence gauge
                const confidence = intent.confidence !== undefined ? intent.confidence : 1.0;
                const pct = Math.round(confidence * 100);
                const gauge = document.createElement("div");
                gauge.className = "confidence-gauge";
                gauge.innerHTML = `
                    <span>Conf: ${pct}%</span>
                    <div class="gauge-track">
                        <div class="gauge-fill" style="width: ${pct}%"></div>
                    </div>
                `;
                header.appendChild(gauge);
                card.appendChild(header);

                // Action Phrase
                if (intent.action_phrase) {
                    const phrase = document.createElement("div");
                    phrase.className = "action-phrase-block";
                    phrase.textContent = `"${intent.action_phrase}"`;
                    card.appendChild(phrase);
                }

                // Entity & Parameters Layout
                const details = document.createElement("div");
                details.className = "intent-details";

                // Entity
                const entityItem = document.createElement("div");
                entityItem.className = "detail-item";
                entityItem.innerHTML = `
                    <span class="detail-label">Target Entity</span>
                    <span class="detail-val ${intent.entity ? '' : 'empty'}">${intent.entity || 'None detected'}</span>
                `;
                details.appendChild(entityItem);

                // Parameters
                const paramsItem = document.createElement("div");
                paramsItem.className = "detail-item";
                let paramsText = "";
                if (intent.parameters && Object.keys(intent.parameters).length > 0) {
                    paramsText = Object.entries(intent.parameters)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ");
                }
                paramsItem.innerHTML = `
                    <span class="detail-label">Action Parameters</span>
                    <span class="detail-val ${paramsText ? '' : 'empty'}">${paramsText || 'None'}</span>
                `;
                details.appendChild(paramsItem);
                card.appendChild(details);

                // Status of work / Clarification
                const statusAndClarification = document.createElement("div");
                statusAndClarification.className = "intent-header";

                // Status
                const statusKey = Object.keys(intent).find(k => k.toLowerCase().includes("status"));
                const statusVal = statusKey ? intent[statusKey] : null;
                if (statusVal) {
                    const statusPill = document.createElement("span");
                    statusPill.className = `status-pill ${statusVal.toLowerCase().includes("success") ? 'success' : 'failure'}`;
                    statusPill.textContent = statusVal;
                    statusAndClarification.appendChild(statusPill);
                }

                // Flag Clarification inside the card too
                if (intent.needs_clarification) {
                    const warnText = document.createElement("span");
                    warnText.style.color = "var(--warning)";
                    warnText.style.fontSize = "0.8rem";
                    warnText.style.fontWeight = "600";
                    warnText.textContent = "Requires Clarification";
                    statusAndClarification.appendChild(warnText);
                }
                
                card.appendChild(statusAndClarification);
                intentsContainer.appendChild(card);
            });
        } else {
            intentsContainer.innerHTML = `<p class="subtitle">No intents parsed.</p>`;
        }
    }

    // Render error screen
    function renderError(message) {
        resultPlaceholder.innerHTML = `
            <svg style="width:48px; height:48px; color:var(--danger);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="15" y1="9" x2="9" y2="15"></line>
                <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            <p style="color:var(--danger); font-weight:600; margin-top:1rem;">Error Analyzing Intent</p>
            <span class="subtext" style="max-width:350px; margin-top:0.25rem;">${message}</span>
        `;
        resultPlaceholder.classList.remove("hidden");
        visualDashboard.classList.add("hidden");
    }
});
