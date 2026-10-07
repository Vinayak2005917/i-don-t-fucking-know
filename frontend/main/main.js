const fileName = sessionStorage.getItem("uploadedFileName");
let fileText = sessionStorage.getItem("uploadedFileText");
const rankButton = document.getElementById("rankButton");
const clausePanel = document.getElementById("clausePanel");
const clausePanelClose = document.getElementById("clausePanelClose");
const clausePanelTitle = document.getElementById("clausePanelTitle");
const clauseScore = document.getElementById("clauseScore");
const clauseWords = document.getElementById("clauseWords");
const clauseTarget = document.getElementById("clauseTarget");
const clauseContext = document.getElementById("clauseContext");
const improvedBlock = document.getElementById("improvedBlock");
const clauseImproved = document.getElementById("clauseImproved");
const clauseImprovedScore = document.getElementById("clauseImprovedScore");
const rewriteButton = document.getElementById("rewriteButton");
const rewriteStatus = document.getElementById("rewriteStatus");
const panelToggle = document.getElementById("panelToggle");
const panelClose = document.getElementById("panelClose");
const statsPanel = document.getElementById("statsPanel");
const panelResizeHandle = document.getElementById("panelResizeHandle");
const scoreChart = document.getElementById("scoreChart");
const scoreHistogram = document.getElementById("scoreHistogram");
const lengthScoreScatter = document.getElementById("lengthScoreScatter");
const chartEmpty = document.getElementById("chartEmpty");
const scoreTooltip = document.createElement("div");
scoreTooltip.className = "score-tooltip";
scoreTooltip.setAttribute("role", "status");
scoreTooltip.hidden = true;
document.body.appendChild(scoreTooltip);
let segmentedClauses = [];
let clauseElements = [];
let memoryScores = [];
let chartAnimationFrame = 0;
let histogramAnimationFrame = 0;
let scatterAnimationFrame = 0;
let chartGeometry = null;
let histogramGeometry = null;
let scatterGeometry = null;
let panelCloseTimer = 0;
let isResizingPanel = false;
let panelResizeStartX = 0;
let panelResizeStartWidth = 0;
let chartResizeFrame = 0;
let selectedClauseIndex = -1;
let improvedClausesByIndex = new Map();
let clausePanelCloseTimer = 0;

const chartResizeObserver = new ResizeObserver(() => {
	if (statsPanel.hidden || !memoryScores.length || chartResizeFrame) return;

	chartResizeFrame = requestAnimationFrame(() => {
		chartResizeFrame = 0;
		redrawCharts();
	});
});

chartResizeObserver.observe(scoreChart);
chartResizeObserver.observe(scoreHistogram);
chartResizeObserver.observe(lengthScoreScatter);

panelResizeHandle.addEventListener("pointerdown", startPanelResize);
panelResizeHandle.addEventListener("keydown", resizePanelWithKeyboard);

panelToggle.addEventListener("click", () => {
	const isOpen = !statsPanel.hidden;
	if (isOpen) closeStatsPanel();
	else openStatsPanel();
});

panelClose.addEventListener("click", () => {
	closeStatsPanel();
});

clausePanelClose.addEventListener("click", () => {
	closeClausePanel();
});

rewriteButton.addEventListener("click", rewriteSelectedClause);

scoreChart.addEventListener("mousemove", handleChartHover);
scoreChart.addEventListener("mouseleave", hideScoreTooltip);
scoreChart.addEventListener("click", focusChartClause);
scoreHistogram.addEventListener("mousemove", handleHistogramHover);
scoreHistogram.addEventListener("mouseleave", hideScoreTooltip);
lengthScoreScatter.addEventListener("mousemove", handleScatterHover);
lengthScoreScatter.addEventListener("mouseleave", hideScoreTooltip);
lengthScoreScatter.addEventListener("click", focusScatterClause);

function openStatsPanel() {
	clearTimeout(panelCloseTimer);
	statsPanel.hidden = false;
	panelToggle.setAttribute("aria-expanded", "true");
	requestAnimationFrame(() => statsPanel.classList.add("is-open"));
	if (memoryScores.length) {
		drawScoreChart();
		drawScoreHistogram();
		drawLengthScoreScatter();
	}
}

function closeStatsPanel() {
	statsPanel.classList.remove("is-open");
	panelToggle.setAttribute("aria-expanded", "false");
	clearTimeout(panelCloseTimer);
	panelCloseTimer = setTimeout(() => {
		statsPanel.hidden = true;
	}, 260);
}

function startPanelResize(event) {
	if (window.matchMedia("(max-width: 640px)").matches) return;

	isResizingPanel = true;
	panelResizeStartX = event.clientX;
	panelResizeStartWidth = statsPanel.getBoundingClientRect().width;
	statsPanel.classList.add("is-resizing");
	panelResizeHandle.setPointerCapture(event.pointerId);
	panelResizeHandle.addEventListener("pointermove", resizePanel);
	panelResizeHandle.addEventListener("pointerup", stopPanelResize, { once: true });
	panelResizeHandle.addEventListener("pointercancel", stopPanelResize, { once: true });
	event.preventDefault();
}

function resizePanel(event) {
	if (!isResizingPanel) return;

	const width = panelResizeStartWidth - (event.clientX - panelResizeStartX);
	const maxWidth = Math.min(680, Math.max(320, window.innerWidth - 280));
	const nextWidth = Math.max(320, Math.min(maxWidth, width));
	statsPanel.style.setProperty("--stats-panel-width", `${nextWidth}px`);
}

function stopPanelResize() {
	isResizingPanel = false;
	statsPanel.classList.remove("is-resizing");
	panelResizeHandle.removeEventListener("pointermove", resizePanel);
}

function resizePanelWithKeyboard(event) {
	if (window.matchMedia("(max-width: 640px)").matches) return;
	if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

	const direction = event.key === "ArrowLeft" ? 1 : -1;
	const currentWidth = statsPanel.getBoundingClientRect().width;
	const maxWidth = Math.min(680, Math.max(320, window.innerWidth - 280));
	const nextWidth = Math.max(320, Math.min(maxWidth, currentWidth + direction * 16));
	statsPanel.style.setProperty("--stats-panel-width", `${nextWidth}px`);
	event.preventDefault();
}

window.addEventListener("resize", () => {
	if (!statsPanel.hidden && memoryScores.length) {
		redrawCharts();
	}
});

function redrawCharts() {
	drawScoreChart();
	drawScoreHistogram();
	drawLengthScoreScatter();
}

if (fileName) {
	document.getElementById("fileName").textContent = fileName;
}

if (fileText !== null) {
	const textElement = document.getElementById("fileText");
	textElement.textContent = fileText;

	segmentText(fileText, textElement);
}

async function segmentText(text, textElement) {
	try {
		const response = await fetch("http://localhost:8000/Segment", {
			method: "POST",
			headers: { "Content-Type": "text/plain; charset=UTF-8" },
			body: text
		});

		if (!response.ok) {
			throw new Error(`Segmentation failed: ${response.status}`);
		}

		const clauses = await response.json();
		const spans = matchClausesToSource(text, clauses);
		textElement.replaceChildren();
		const clauseTexts = spans.filter((span) => span.text).map((span) => span.text);
		segmentedClauses = clauses;
		memoryScores = [];
		clauseElements = [];
				improvedClausesByIndex = new Map();
				selectedClauseIndex = -1;
				hideClausePanel();
				rankButton.disabled = clauses.length === 0;
				document.getElementById("clauseCount").textContent = clauseTexts.length;
				document.getElementById("averageClauseLength").textContent = `${getAverageWordCount(clauseTexts)} words`;

				spans.forEach((span, index) => {
					if (span.gap) {
						textElement.appendChild(document.createTextNode(span.gap));
					}
					if (!span.text) return;
					const clauseElement = document.createElement("span");
					clauseElement.className = "clause";
					clauseElement.dataset.clauseNumber = index + 1;
					clauseElement.textContent = span.text;
					clauseElement.tabIndex = 0;
					clauseElement.setAttribute("role", "button");
					clauseElement.setAttribute("aria-label", `Clause ${index + 1}. Open clause details.`);
					clauseElement.addEventListener("click", () => openClausePanel(index));
					clauseElement.addEventListener("keydown", (event) => {
						if (event.key !== "Enter" && event.key !== " ") return;
						event.preventDefault();
						openClausePanel(index);
					});
					textElement.appendChild(clauseElement);
					clauseElements.push(clauseElement);
				});
	} catch (error) {
		console.error("Segmentation error:", error);
	}
}

async function rankClauses() {
	if (!segmentedClauses.length) return;

	rankButton.disabled = true;
	rankButton.textContent = "Ranking...";

	try {
		const response = await fetch("http://localhost:8000/Mem_Ranker", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(segmentedClauses)
		});

		if (!response.ok) {
			throw new Error(`Memory ranking failed: ${response.status}`);
		}

		const rankedClauses = await response.json();
		memoryScores = rankedClauses.map(({ score }) => Math.max(0, Math.min(1, Number(score))));
		updateScoreStats();
		rankedClauses.forEach(({ score }, index) => {
			const clauseElement = clauseElements[index];
			if (!clauseElement) return;

			const normalizedScore = Math.max(0, Math.min(1, Number(score)));
			clauseElement.classList.add("clause-scored");
			clauseElement.style.setProperty("--memory-score", normalizedScore);
			clauseElement.style.setProperty("--clause-tint", getClauseTint(normalizedScore));
			clauseElement.dataset.score = formatScore(normalizedScore);
			clauseElement.addEventListener("mouseenter", showScoreTooltip);
			clauseElement.addEventListener("mouseleave", hideScoreTooltip);
			clauseElement.addEventListener("focus", showScoreTooltip);
			clauseElement.addEventListener("blur", hideScoreTooltip);
		});
		drawScoreChart();
		drawScoreHistogram();
		drawLengthScoreScatter();
	} catch (error) {
		console.error("Memory ranking error:", error);
	} finally {
		rankButton.disabled = false;
		rankButton.textContent = "Rank memory";
	}
}

rankButton.addEventListener("click", rankClauses);

const CONTEXT_WINDOW = 1;

function countWords(text) {
	return (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || []).length;
}

function openClausePanel(index) {
	if (index < 0 || index >= segmentedClauses.length) return;

	selectedClauseIndex = index;
	const clause = segmentedClauses[index];
	const clauseElement = clauseElements[index];

	clauseElements.forEach((element) => element.classList.remove("clause-selected"));
	if (clauseElement) clauseElement.classList.add("clause-selected");

	clausePanelTitle.textContent = `Clause ${index + 1}`;
	clauseScore.textContent = memoryScores[index] === undefined
		? "Not ranked"
		: formatScore(memoryScores[index]);
	clauseWords.textContent = countWords(clause);
		clauseTarget.value = clause;
	rewriteButton.disabled = false;
	setRewriteStatus("");
	renderClauseContext(index);
	renderImprovedClause(index);
	openClausePanelView();
}

function renderClauseContext(index) {
	const start = Math.max(0, index - CONTEXT_WINDOW);
	const end = Math.min(segmentedClauses.length - 1, index + CONTEXT_WINDOW);
	clauseContext.replaceChildren();

	if (start === end && segmentedClauses.length === 1) {
		const empty = document.createElement("p");
		empty.className = "clause-context-empty";
		empty.textContent = "This is the only clause, so there is no surrounding context.";
		clauseContext.appendChild(empty);
		return;
	}

	for (let cursor = start; cursor <= end; cursor += 1) {
		const item = document.createElement("li");
		item.textContent = segmentedClauses[cursor];
		if (cursor === index) item.classList.add("is-target");
		clauseContext.appendChild(item);
	}
}

function renderImprovedClause(index) {
	const improved = improvedClausesByIndex.get(index);
	if (!improved) {
		improvedBlock.hidden = true;
		return;
	}

	improvedBlock.hidden = false;
	clauseImproved.textContent = improved.text;
	clauseImprovedScore.textContent = improved.score === null
		? "--"
		: formatScore(improved.score);
}

async function rewriteSelectedClause() {
	const index = selectedClauseIndex;
	if (index < 0 || index >= segmentedClauses.length) return;

	// The model expects the target clause framed by its neighbours, so send a
		// small window rather than the whole document.  Any edit the user made in
		// the textarea replaces the target; the neighbours stay as context.
		const start = Math.max(0, index - CONTEXT_WINDOW);
		const end = Math.min(segmentedClauses.length - 1, index + CONTEXT_WINDOW);
		const edited = clauseTarget.value.trim();
		const clauses = segmentedClauses.slice(start, end + 1);
		const targetIndex = index - start;
		if (edited) {
			clauses[targetIndex] = edited;
		}

		rewriteButton.disabled = true;
		rewriteButton.classList.add("is-loading");
		rewriteButton.setAttribute("aria-busy", "true");
		rewriteButton.textContent = "Improving...";
		setRewriteStatus("Sending the clause and its context to the model...");

		try {
			const response = await fetch("http://localhost:8000/Rewrite_Clause", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					clauses,
					target_index: targetIndex,
					target_text: clauses[targetIndex]
				})
			});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.detail || `Improvement failed: ${response.status}`);
		}

		const result = await response.json();
		improvedClausesByIndex.set(index, {
			text: result.improved,
			score: result.score === undefined ? null : Number(result.score)
		});
		renderImprovedClause(index);

		const score = Number(result.score);
		const previous = memoryScores[index];
		if (Number.isFinite(score) && previous !== undefined) {
			const change = Math.round((score - previous) * 100);
			setRewriteStatus(change === 0
				? "Improved. The memory score is unchanged."
				: `Improved. Memory score ${change > 0 ? "up" : "down"} ${Math.abs(change)} points.`);
		} else {
			setRewriteStatus("Improved.");
		}
	} catch (error) {
		console.error("Clause rewrite error:", error);
		setRewriteStatus(error.message || "The rewrite request failed.", true);
	} finally {
		rewriteButton.disabled = false;
		rewriteButton.classList.remove("is-loading");
		rewriteButton.removeAttribute("aria-busy");
		rewriteButton.textContent = "Improve this clause";
	}
}

function setRewriteStatus(message, isError = false) {
	rewriteStatus.textContent = message;
	rewriteStatus.classList.toggle("is-error", Boolean(isError));
}

function openClausePanelView() {
	clearTimeout(clausePanelCloseTimer);
	clausePanel.hidden = false;
	requestAnimationFrame(() => clausePanel.classList.add("is-open"));
}

function hideClausePanel() {
	clausePanel.classList.remove("is-open");
	clearTimeout(clausePanelCloseTimer);
	clausePanelCloseTimer = setTimeout(() => {
		clausePanel.hidden = true;
	}, 260);
}

function closeClausePanel() {
	selectedClauseIndex = -1;
	clauseElements.forEach((element) => element.classList.remove("clause-selected"));
	hideClausePanel();
}

function updateScoreStats() {
	if (!memoryScores.length) return;

	const average = memoryScores.reduce((total, score) => total + score, 0) / memoryScores.length;
	document.getElementById("scoreAverage").textContent = formatScore(average);
	document.getElementById("scoreHighest").textContent = formatScore(Math.max(...memoryScores));
	document.getElementById("scoreLowest").textContent = formatScore(Math.min(...memoryScores));
}

function formatScore(score) {
	return `${Math.round(score * 100)}%`;
}

function getClauseTint(score) {
	if (score < 0.34) return "rgba(194, 52, 52, 0.28)";
	if (score < 0.67) return "rgba(220, 174, 20, 0.28)";
	return "rgba(39, 122, 67, 0.28)";
}

function prepareCanvas(canvas) {
	const bounds = canvas.getBoundingClientRect();
	const width = Math.max(1, bounds.width);
	const height = Math.max(1, bounds.height);
	const devicePixelRatio = window.devicePixelRatio || 1;
	const pixelWidth = Math.max(1, Math.round(width * devicePixelRatio));
	const pixelHeight = Math.max(1, Math.round(height * devicePixelRatio));

	canvas.width = pixelWidth;
	canvas.height = pixelHeight;

	const context = canvas.getContext("2d");
	context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
	return { context, width, height };
}

function drawScoreChart() {
	if (!memoryScores.length) return;

	chartEmpty.hidden = true;
	const { context, width, height } = prepareCanvas(scoreChart);
	context.clearRect(0, 0, width, height);

	const padding = { top: 8, right: 8, bottom: 20, left: 8 };
	const graphWidth = width - padding.left - padding.right;
	const graphHeight = height - padding.top - padding.bottom;
	const x = (index) => padding.left + (memoryScores.length === 1 ? graphWidth / 2 : index * graphWidth / (memoryScores.length - 1));
	const y = (score) => padding.top + (1 - score) * graphHeight;
	chartGeometry = { x, y, padding, width, height };
	cancelAnimationFrame(chartAnimationFrame);
	const startedAt = performance.now();
	const duration = 650;
	const animate = (now) => {
		const progress = Math.min(1, (now - startedAt) / duration);
		const eased = 1 - Math.pow(1 - progress, 3);
		context.clearRect(0, 0, width, height);
		drawScoreChartFrame(context, width, height, padding, x, y, eased);
		if (progress < 1) chartAnimationFrame = requestAnimationFrame(animate);
	};
	chartAnimationFrame = requestAnimationFrame(animate);
}

function drawScoreChartFrame(context, width, height, padding, x, y, progress) {

	context.font = "11px Segoe UI, sans-serif";
	context.strokeStyle = "#edf1ee";
	context.fillStyle = "#7d8793";
	context.lineWidth = 1;
	[0, 0.5, 1].forEach((value) => {
		const lineY = y(value);
		context.beginPath();
		context.moveTo(padding.left, lineY);
		context.lineTo(width - padding.right, lineY);
		context.stroke();
	});

	const visibleCount = Math.max(1, Math.ceil(memoryScores.length * progress));

	context.beginPath();
	memoryScores.slice(0, visibleCount).forEach((score, index) => {
		if (index === 0) context.moveTo(x(index), y(score));
		else context.lineTo(x(index), y(score));
	});
	context.strokeStyle = "#537766";
	context.lineWidth = 1.5;
	context.stroke();

	memoryScores.slice(0, visibleCount).forEach((score, index) => {
		context.beginPath();
		context.arc(x(index), y(score), 3, 0, Math.PI * 2);
		context.fillStyle = "#537766";
		context.fill();
	});
	context.fillStyle = "#7d8793";
	context.fillText("1", padding.left, height - 8);
	context.fillText(String(memoryScores.length), width - padding.right - 8, height - 8);
}

function drawScoreHistogram() {
	if (!memoryScores.length) return;

	const { context, width, height } = prepareCanvas(scoreHistogram);
	context.clearRect(0, 0, width, height);

	const labels = Array.from({ length: 10 }, (_, index) => {
		const start = formatScore(index * 0.1);
		const end = formatScore((index + 1) * 0.1);
		return `${start}-${end}`;
	});
	const counts = Array(10).fill(0);
	memoryScores.forEach((score) => {
		const bin = score === 1 ? 9 : Math.min(9, Math.floor(score / 0.1));
		counts[bin] += 1;
	});

	const padding = { top: 8, right: 8, bottom: 20, left: 8 };
	const graphWidth = width - padding.left - padding.right;
	const graphHeight = height - padding.top - padding.bottom;
	const highestCount = Math.max(...counts, 1);
	const barGap = 5;
	const barWidth = (graphWidth - barGap * (counts.length - 1)) / counts.length;
	histogramGeometry = { padding, width, height, graphHeight, highestCount, barGap, barWidth, counts, labels };
	cancelAnimationFrame(histogramAnimationFrame);
	const startedAt = performance.now();
	const duration = 550;
	const animate = (now) => {
		const progress = Math.min(1, (now - startedAt) / duration);
		const eased = 1 - Math.pow(1 - progress, 3);
		context.clearRect(0, 0, width, height);
		drawHistogramFrame(context, width, height, padding, graphWidth, graphHeight, highestCount, barGap, barWidth, counts, labels, eased);
		if (progress < 1) histogramAnimationFrame = requestAnimationFrame(animate);
	};
	histogramAnimationFrame = requestAnimationFrame(animate);
}

function drawHistogramFrame(context, width, height, padding, graphWidth, graphHeight, highestCount, barGap, barWidth, counts, labels, progress) {

	context.font = "11px Segoe UI, sans-serif";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillStyle = "#7d8793";
	context.strokeStyle = "#edf1ee";
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(padding.left, padding.top + graphHeight);
	context.lineTo(width - padding.right, padding.top + graphHeight);
	context.stroke();
	context.fillStyle = "#7d8793";
	context.fillText("0%", padding.left, height - 8);
	context.fillText("50%", padding.left + graphWidth / 2, height - 8);
	context.fillText("100%", width - padding.right, height - 8);

	counts.forEach((count, index) => {
		const barHeight = count / highestCount * graphHeight * progress;
		const x = padding.left + index * (barWidth + barGap);
		const y = padding.top + graphHeight - barHeight;
		context.fillStyle = "#537766";
		context.fillRect(x, y, barWidth, barHeight);
	});
}

function getClauseWordCounts() {
	return segmentedClauses.map((clause) => (
		String(clause).match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || []
	).length);
}

function drawLengthScoreScatter() {
	if (!memoryScores.length) return;

	const { context, width, height } = prepareCanvas(lengthScoreScatter);
	context.clearRect(0, 0, width, height);

	const wordCounts = getClauseWordCounts();
	const maxWords = Math.max(...wordCounts, 1);
	const padding = { top: 8, right: 8, bottom: 20, left: 26 };
	const graphWidth = width - padding.left - padding.right;
	const graphHeight = height - padding.top - padding.bottom;
	const x = (wordCount) => padding.left + (wordCount / maxWords) * graphWidth;
	const y = (score) => padding.top + (1 - score) * graphHeight;
	scatterGeometry = { x, y, padding, graphWidth, graphHeight, wordCounts, maxWords };

	cancelAnimationFrame(scatterAnimationFrame);
	const startedAt = performance.now();
	const animate = (now) => {
		const progress = Math.min(1, (now - startedAt) / 650);
		const eased = 1 - Math.pow(1 - progress, 3);
		context.clearRect(0, 0, width, height);
		drawScatterFrame(context, width, height, padding, graphWidth, graphHeight, wordCounts, maxWords, eased);
		if (progress < 1) scatterAnimationFrame = requestAnimationFrame(animate);
	};
	scatterAnimationFrame = requestAnimationFrame(animate);
}

function drawScatterFrame(context, width, height, padding, graphWidth, graphHeight, wordCounts, maxWords, progress) {
	context.font = "11px Segoe UI, sans-serif";
	context.textBaseline = "middle";
	context.fillStyle = "#7d8793";
	context.strokeStyle = "#edf1ee";
	context.lineWidth = 1;
	[0, 0.5, 1].forEach((value) => {
		const lineY = padding.top + (1 - value) * graphHeight;
		context.beginPath();
		context.moveTo(padding.left, lineY);
		context.lineTo(width - padding.right, lineY);
		context.stroke();
		context.textAlign = "left";
		context.fillText(formatScore(value), 7, lineY);
	});

	context.beginPath();
	context.moveTo(padding.left, padding.top + graphHeight);
	context.lineTo(width - padding.right, padding.top + graphHeight);
	context.stroke();
	context.textAlign = "left";
	context.fillText("0", padding.left, height - 16);
	context.textAlign = "right";
	context.fillText(String(maxWords), width - padding.right, height - 16);
	context.textAlign = "center";
	context.fillText("Clause length (words)", padding.left + graphWidth / 2, height - 3);

	const visibleCount = Math.max(1, Math.ceil(memoryScores.length * progress));
	memoryScores.slice(0, visibleCount).forEach((score, index) => {
		context.beginPath();
		context.arc(padding.left + (wordCounts[index] / maxWords) * graphWidth, padding.top + (1 - score) * graphHeight, 2, 0, Math.PI * 2);
		context.fillStyle = "#537766";
		context.globalAlpha = 0.68 * progress;
		context.fill();
		context.globalAlpha = 1;
	});
}

function handleChartHover(event) {
	if (!chartGeometry || !memoryScores.length) return;
	const rect = scoreChart.getBoundingClientRect();
	const scaleX = scoreChart.width / rect.width / (window.devicePixelRatio || 1);
	const pointerX = (event.clientX - rect.left) * scaleX;
	const index = memoryScores.length === 1
		? 0
		: Math.max(0, Math.min(memoryScores.length - 1, Math.round((pointerX - chartGeometry.padding.left) / ((chartGeometry.width - chartGeometry.padding.left - chartGeometry.padding.right) / (memoryScores.length - 1)))));
	showCanvasTooltip(event.clientX, event.clientY, `Clause ${index + 1}: ${formatScore(memoryScores[index])}`);
}

function handleHistogramHover(event) {
	if (!histogramGeometry) return;
	const rect = scoreHistogram.getBoundingClientRect();
	const pointerX = event.clientX - rect.left;
	const { padding, barWidth, barGap, counts, labels } = histogramGeometry;
	const index = Math.floor((pointerX - padding.left) / (barWidth + barGap));
	if (index < 0 || index >= counts.length || pointerX > padding.left + (barWidth + barGap) * index + barWidth) {
		hideScoreTooltip();
		return;
	}
	showCanvasTooltip(event.clientX, event.clientY, `${labels[index]}: ${counts[index]} clause${counts[index] === 1 ? "" : "s"}`);
}

function getScatterPointIndex(event) {
	if (!scatterGeometry || !memoryScores.length) return -1;
	const rect = lengthScoreScatter.getBoundingClientRect();
	const pointerX = event.clientX - rect.left;
	const pointerY = event.clientY - rect.top;
	let nearestIndex = -1;
	let nearestDistance = 14;

	scatterGeometry.wordCounts.forEach((wordCount, index) => {
		const distance = Math.hypot(
			pointerX - scatterGeometry.x(wordCount),
			pointerY - scatterGeometry.y(memoryScores[index])
		);
		if (distance <= nearestDistance) {
			nearestDistance = distance;
			nearestIndex = index;
		}
	});

	return nearestIndex;
}

function handleScatterHover(event) {
	const index = getScatterPointIndex(event);
	if (index < 0) {
		hideScoreTooltip();
		return;
	}
	showCanvasTooltip(event.clientX, event.clientY, `Clause ${index + 1}: ${scatterGeometry.wordCounts[index]} words, score ${formatScore(memoryScores[index])}`);
}

function focusScatterClause(event) {
	const index = getScatterPointIndex(event);
	selectClause(index);
}

function focusChartClause(event) {
	if (!chartGeometry || !memoryScores.length) return;
	const rect = scoreChart.getBoundingClientRect();
	const pointerX = event.clientX - rect.left;
	const pointerY = event.clientY - rect.top;
	let index = -1;
	let nearestDistance = 14;
	memoryScores.forEach((score, candidateIndex) => {
		const distance = Math.hypot(
			pointerX - chartGeometry.x(candidateIndex),
			pointerY - chartGeometry.y(score)
		);
		if (distance <= nearestDistance) {
			nearestDistance = distance;
			index = candidateIndex;
		}
	});
	selectClause(index);
}

function selectClause(index) {
	if (index < 0 || index >= segmentedClauses.length) return;

	openClausePanel(index);

	const clause = clauseElements[index];
	if (clause) {
		clause.scrollIntoView({ behavior: "smooth", block: "center" });
		clause.focus({ preventScroll: true });
	}
}

function showCanvasTooltip(clientX, clientY, text) {
	scoreTooltip.textContent = text;
	scoreTooltip.hidden = false;
	scoreTooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - scoreTooltip.offsetWidth - 8, clientX + 12))}px`;
	scoreTooltip.style.top = `${Math.max(8, clientY - scoreTooltip.offsetHeight - 10)}px`;
}

function showScoreTooltip(event) {
	const clauseElement = event.currentTarget;
	const bounds = clauseElement.getBoundingClientRect();
	scoreTooltip.textContent = clauseElement.dataset.score;
	scoreTooltip.hidden = false;

	const left = Math.max(8, Math.min(
		window.innerWidth - scoreTooltip.offsetWidth - 8,
		bounds.left + (bounds.width - scoreTooltip.offsetWidth) / 2
	));
	scoreTooltip.style.left = `${left}px`;
	scoreTooltip.style.top = `${Math.max(8, bounds.top - scoreTooltip.offsetHeight - 8)}px`;
}

function hideScoreTooltip() {
	scoreTooltip.hidden = true;
}

function getAverageWordCount(clauseTexts) {
	if (!clauseTexts.length) return 0;

	const totalWords = clauseTexts.reduce((total, clause) => {
		const words = clause.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || [];
		return total + words.length;
	}, 0);

	return (totalWords / clauseTexts.length).toFixed(1);
}

function matchClausesToSource(source, clauses) {
	const spans = [];
	let searchFrom = 0;

	for (const clause of clauses) {
		const words = clause.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) || [];
		if (words.length === 0) continue;

		let cursor = searchFrom;
		let start = -1;
		let end = -1;
		for (const word of words) {
			const wordStart = findWord(source, word, cursor);
			if (wordStart === -1) break;
			if (start === -1) start = wordStart;
			end = wordStart + word.length;
			cursor = end;
		}

		if (start !== -1 && end !== -1) {
			spans.push({
				gap: source.slice(searchFrom, start),
				text: source.slice(start, end),
			});
			searchFrom = end;
		}
	}

	if (!spans.length) return [{ text: source }];
	if (searchFrom < source.length) {
		spans.push({ gap: source.slice(searchFrom), text: "" });
	}
	return spans;
}

function findWord(source, word, from) {
	const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu").exec(source.slice(from));
	return match ? from + match.index : -1;
}
