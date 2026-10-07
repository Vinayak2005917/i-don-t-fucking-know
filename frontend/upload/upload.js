const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const uploadStatus = document.getElementById("uploadStatus");

["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.add("dragover");
    });
});

["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove("dragover");
    });
});

dropZone.addEventListener("drop", (e) => {
    const files = e.dataTransfer.files;

    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) {
        handleFile(fileInput.files[0]);
    }
});

async function handleFile(file) {
    // The extension is checked here because some browsers report .txt files
    // as application/octet-stream. UTF-8 validation is performed by the backend.
    const isTextFile = file.name.toLowerCase().endsWith(".txt");

    if (!isTextFile) {
        uploadStatus.textContent = "Only UTF-8 .txt files are accepted.";
        fileInput.value = "";
        return;
    }

    uploadStatus.textContent = "Uploading...";
    console.log("File:", file);
    console.log("Name:", file.name);
    console.log("Type:", file.type);
    console.log("Size:", file.size, "bytes");

    const formData = new FormData();
    formData.append("file", file);

    try {
        const response = await fetch("http://localhost:8000/upload", {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `Upload failed: ${response.status}`);
        }

        const result = await response.json();

        console.log("Server response:", result);
        sessionStorage.setItem("uploadedFileName", result.filename);
        sessionStorage.setItem("uploadedFileText", result.text);
        sessionStorage.removeItem("uploadedFileClauses");
        window.location.href = "../main/main.html";
    } catch (error) {
        console.error("Upload error:", error);
        uploadStatus.textContent = error.message;
    }
}