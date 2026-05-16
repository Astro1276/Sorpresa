import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAs5X-MhYF6...",
    authDomain: "loboweaver-f81dd.firebaseapp.com",
    projectId: "loboweaver-f81dd",
    storageBucket: "loboweaver-f81dd.appspot.com",
    messagingSenderId: "381655822394",
    appId: "1:381655822394:web:8e3089d5f70bbbe2505530"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let editores = {};
let pyodideInstance = null;
let currentEnv = "web";

let archivos = JSON.parse(localStorage.getItem("lobo_archivos")) || {
    html: [{ name: "index.html", content: "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n    <meta charset=\"UTF-8\">\n    <title>Demo</title>\n</head>\n<body>\n    <h1>Hola Lobo Weaver</h1>\n</body>\n</html>" }],
    css: [{ name: "style.css", content: "body {\n    background: #0f172a;\n    color: #fff;\n    text-align: center;\n}" }],
    js: [{ name: "script.js", content: "console.log('Lobo Weaver Activo');" }],
    py: [{ name: "main.py", content: "print('Hola desde Python funcional')" }]
};

let indiceActual = JSON.parse(localStorage.getItem("lobo_indices")) || { html: 0, css: 0, js: 0, py: 0 };

function guardarLocal() {
    localStorage.setItem("lobo_archivos", JSON.stringify(archivos));
    localStorage.setItem("lobo_indices", JSON.stringify(indiceActual));
}

async function inicializarPyodide() {
    if (!pyodideInstance) {
        const consola = document.getElementById("py-output");
        consola.innerHTML = "Cargando entorno de Python...";
        try {
            pyodideInstance = await loadPyodide();
            consola.innerHTML = "Python v" + pyodideInstance.version + " Inicializado con éxito.\n";
        } catch (e) {
            consola.innerHTML = "Error al cargar Python: " + e.message;
        }
    }
}

function inicializarEditores() {
    ace.require("ace/ext/language_tools");
    const configBase = {
        theme: "ace/theme/tomorrow_night_eighties",
        fontSize: "14px",
        enableBasicAutocompletion: true,
        enableLiveAutocompletion: true,
        showPrintMargin: false,
        useSoftTabs: true
    };

    editores.html = ace.edit("html-editor");
    editores.html.setOptions({ ...configBase, mode: "ace/mode/html" });

    editores.css = ace.edit("css-editor");
    editores.css.setOptions({ ...configBase, mode: "ace/mode/css" });

    editores.js = ace.edit("js-editor");
    editores.js.setOptions({ ...configBase, mode: "ace/mode/javascript" });

    editores.py = ace.edit("py-editor");
    editores.py.setOptions({ ...configBase, mode: "ace/mode/python" });

    Object.keys(editores).forEach(lang => {
        if (archivos[lang] && archivos[lang][indiceActual[lang]]) {
            editores[lang].setValue(archivos[lang][indiceActual[lang]].content, -1);
        }
        editores[lang].on("change", () => {
            archivos[lang][indiceActual[lang]].content = editores[lang].getValue();
            guardarLocal();
            ejecucionAutomatica();
        });
    });

    renderizarListasArchivos();
    ejecucionAutomatica();
}

function renderizarListasArchivos() {
    ["html", "css", "js"].forEach(lang => {
        const lista = document.getElementById(`filelist-${lang}`);
        if (!lista) return;
        lista.innerHTML = "";
        archivos[lang].forEach((archivo, idx) => {
            const li = document.createElement("li");
            li.className = idx === indiceActual[lang] ? "active" : "";
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "5px";
            li.style.cursor = "pointer";

            const span = document.createElement("span");
            span.innerText = archivo.name;
            span.onclick = () => {
                indiceActual[lang] = idx;
                editores[lang].setValue(archivos[lang][idx].content, -1);
                renderizarListasArchivos();
                ejecucionAutomatica();
            };

            li.appendChild(span);

            if (archivos[lang].length > 1) {
                const btnDel = document.createElement("button");
                btnDel.innerText = "✕";
                btnDel.style.background = "none";
                btnDel.style.border = "none";
                btnDel.style.color = "#ef4444";
                btnDel.style.cursor = "pointer";
                btnDel.onclick = (e) => {
                    e.stopPropagation();
                    archivos[lang].splice(idx, 1);
                    if (indiceActual[lang] >= archivos[lang].length) {
                        indiceActual[lang] = archivos[lang].length - 1;
                    }
                    editores[lang].setValue(archivos[lang][indiceActual[lang]].content, -1);
                    guardarLocal();
                    renderizarListasArchivos();
                    ejecucionAutomatica();
                };
                li.appendChild(btnDel);
            }
            lista.appendChild(li);
        });
    });
}

async function ejecucionAutomatica() {
    if (currentEnv === "web") {
        const iframe = document.getElementById("output");
        if (!iframe) return;
        const docIframe = iframe.contentDocument || iframe.contentWindow.document;
        
        const htmlContent = editores.html.getValue();
        const cssContent = `<style>${editores.css.getValue()}</style>`;
        const jsContent = `
            <script>
                window.onerror = function(msg, url, line) {
                    window.parent.postMessage({type: 'error', msg: msg + ' (Línea ' + line + ')'}, '*');
                };
                try {
                    ${editores.js.getValue()}
                } catch(err) {
                    window.parent.postMessage({type: 'error', msg: err.message}, '*');
                }
            <\/script>
        `;

        docIframe.open();
        docIframe.write(htmlContent + cssContent + jsContent);
        docIframe.close();

        document.getElementById("err-js-preview").style.display = "none";
    } else {
        if (!pyodideInstance) return;
        const code = editores.py.getValue();
        const consola = document.getElementById("py-output");
        try {
            pyodideInstance.runPython(`
                import sys
                import io
                sys.stdout = io.StringIO()
                sys.stderr = io.StringIO()
            `);
            await pyodideInstance.runPythonAsync(code);
            const stdout = pyodideInstance.runPython("sys.stdout.getvalue()");
            const stderr = pyodideInstance.runPython("sys.stderr.getvalue()");
            
            if (stderr) {
                consola.innerHTML = `<span style="color:#ef4444">${stderr}</span>`;
            } else {
                consola.innerText = stdout || "Script ejecutado sin salidas de texto.";
            }
        } catch (err) {
            consola.innerHTML = `<span style="color:#ef4444">${err.message}</span>`;
        }
    }
}

window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "error") {
        const boxErr = document.getElementById("err-js-preview");
        boxErr.innerText = e.data.msg;
        boxErr.style.display = "block";
    }
});

function configurarEntornos() {
    const tabWeb = document.getElementById("tabWeb");
    const tabPy = document.getElementById("tabPy");
    const envWeb = document.getElementById("web-env");
    const envPy = document.getElementById("py-env");

    tabWeb.onclick = () => {
        currentEnv = "web";
        tabWeb.classList.add("active");
        tabPy.classList.remove("active");
        envWeb.classList.remove("hidden");
        envPy.classList.add("hidden");
        ejecucionAutomatica();
    };

    tabPy.onclick = async () => {
        currentEnv = "py";
        tabPy.classList.add("active");
        tabWeb.classList.remove("active");
        envPy.classList.remove("hidden");
        envWeb.classList.add("hidden");
        await inicializarPyodide();
        ejecucionAutomatica();
    };
}

function configurarPaneles() {
    const headers = document.querySelectorAll(".code-panels .panel-header");
    headers.forEach(header => {
        header.onclick = () => {
            const panel = header.parentElement;
            const estaActivo = panel.classList.contains("active");
            
            const activos = document.querySelectorAll(".code-panels .panel.active");
            if (estaActivo && activos.length > 1) {
                panel.classList.remove("active");
            } else {
                panel.classList.add("active");
            }
            
            Object.values(editores).forEach(e => e.resize());
        };
    });
}

function configurarSidebar() {
    const sidebar = document.getElementById("sidebar");
    const openBtn = document.getElementById("openMenu");
    const closeBtn = document.getElementById("closeMenu");

    openBtn.onclick = () => sidebar.classList.add("active");
    closeBtn.onclick = () => sidebar.classList.remove("active");

    const menuHeaders = document.querySelectorAll(".menu-header");
    menuHeaders.forEach(h => {
        h.onclick = () => {
            const targetId = h.getAttribute("data-target");
            const content = document.getElementById(targetId);
            const span = h.querySelector("span");
            if (content.style.display === "block") {
                content.style.display = "none";
                span.innerText = "▼";
            } else {
                content.style.display = "block";
                span.innerText = "▲";
            }
        };
    });
}

function configurarArchivosNuevos() {
    const btnAdds = document.querySelectorAll(".btn-file-add");
    btnAdds.forEach(btn => {
        btn.onclick = () => {
            const type = btn.getAttribute("data-type");
            const name = prompt(`Nombre del archivo .${type}:`);
            if (!name) return;
            
            const fullName = name.endsWith(`.${type}`) ? name : `${name}.${type}`;
            let initContent = "";
            if (type === "html") {
                initContent = "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n    <meta charset=\"UTF-8\">\n    <title>" + name + "</title>\n</head>\n<body>\n    \n</body>\n</html>";
            }
            
            archivos[type].push({ name: fullName, content: initContent });
            indiceActual[type] = archivos[type].length - 1;
            editores[type].setValue(initContent, -1);
            guardarLocal();
            renderizarListasArchivos();
            ejecucionAutomatica();
        };
    });
}

function configurarCopiar() {
    const copyBtns = document.querySelectorAll(".btn-copy");
    copyBtns.forEach(btn => {
        btn.onclick = () => {
            const lang = btn.getAttribute("data-lang");
            const val = editores[lang].getValue();
            navigator.clipboard.writeText(val);
            alert(`Código de ${lang.toUpperCase()} copiado al portapapeles.`);
        };
    });

    document.getElementById("copyFullProject").onclick = () => {
        const total = `\n${editores.html.getValue()}\n\n/* CSS */\n${editores.css.getValue()}\n\n// JS\n${editores.js.getValue()}`;
        navigator.clipboard.writeText(total);
        alert("Proyecto completo copiado.");
    };
}

function configurarExportar() {
    document.getElementById("btnZip").onclick = () => {
        const zip = new JSZip();
        archivos.html.forEach(f => zip.file(f.name, f.content));
        archivos.css.forEach(f => zip.file(f.name, f.content));
        archivos.js.forEach(f => zip.file(f.name, f.content));
        archivos.py.forEach(f => zip.file(f.name, f.content));
        
        zip.generateAsync({ type: "blob" }).then(content => {
            saveAs(content, "lobo_weaver_proyecto.zip");
        });
    };
}

function configurarResponsividad() {
    const resBtns = document.querySelectorAll(".res-btn");
    const iframe = document.getElementById("output");
    resBtns.forEach(btn => {
        btn.onclick = () => {
            resBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            const size = btn.getAttribute("data-size");
            if (size === "desktop") {
                iframe.style.width = "100%";
                iframe.style.height = "100%";
            } else if (size === "tablet") {
                iframe.style.width = "768px";
                iframe.style.height = "100%";
            } else if (size === "mobile") {
                iframe.style.width = "375px";
                iframe.style.height = "100%";
            }
        };
    });
}

function configurarThanos() {
    document.getElementById("thanosSnap").onclick = () => {
        const target = document.getElementById("main-content");
        html2canvas(target).then(canvas => {
            const ctx = canvas.getContext("2d");
            const { width, height } = canvas;
            const imgData = ctx.getImageData(0, 0, width, height);
            
            const overlay = document.createElement("canvas");
            overlay.width = width;
            overlay.height = height;
            overlay.className = "thanos-canvas-overlay";
            document.body.appendChild(overlay);
            const oCtx = overlay.getContext("2d");

            target.style.transition = "opacity 1.5s ease-out";
            target.style.opacity = "0";

            let capas = [];
            for (let i = 0; i < 25; i++) {
                capas.push(oCtx.createImageData(width, height));
            }

            for (let x = 0; x < width; x++) {
                for (let y = 0; y < height; y++) {
                    const idx = (x + y * width) * 4;
                    const cIdx = Math.floor(Math.random() * capas.length);
                    const tCap = capas[cIdx];
                    tCap.data[idx] = imgData.data[idx];
                    tCap.data[idx + 1] = imgData.data[idx + 1];
                    tCap.data[idx + 2] = imgData.data[idx + 2];
                    tCap.data[idx + 3] = imgData.data[idx + 3];
                }
            }

            let frame = 0;
            function dispersion() {
                oCtx.clearRect(0, 0, width, height);
                capas.forEach((capa, index) => {
                    const avance = frame * (index / 2);
                    const factorDesvio = Math.sin(frame * 0.05 + index) * 10;
                    oCtx.putImageData(capa, avance, factorDesvio - frame);
                });
                frame += 1.5;
                if (frame < 80) {
                    requestAnimationFrame(dispersion);
                } else {
                    localStorage.clear();
                    archivos = {
                        html: [{ name: "index.html", content: "<!DOCTYPE html>\n<html lang=\"es\">\n<head>\n    <meta charset=\"UTF-8\">\n    <title>Demo</title>\n</head>\n<body>\n    \n</body>\n</html>" }],
                        css: [{ name: "style.css", content: "" }],
                        js: [{ name: "script.js", content: "" }],
                        py: [{ name: "main.py", content: "" }]
                    };
                    indiceActual = { html: 0, css: 0, js: 0, py: 0 };
                    
                    Object.keys(editores).forEach(lang => {
                        editores[lang].setValue(archivos[lang][0].content, -1);
                    });
                    
                    guardarLocal();
                    renderizarListasArchivos();
                    
                    target.style.opacity = "1";
                    overlay.remove();
                    ejecucionAutomatica();
                }
            }
            dispersion();
        });
    };
}

function configurarFirebase() {
    const info = document.getElementById("user-info");
    const status = document.getElementById("status-cloud");
    const btnGoogle = document.getElementById("btnGoogle");
    const btnLogout = document.getElementById("btnLogout");
    const emailForm = document.getElementById("email-form");
    const btnLogin = document.getElementById("btnLogin");

    btnGoogle.onclick = () => signInWithPopup(auth, provider);
    btnLogout.onclick = () => signOut(auth);

    btnLogin.onclick = async () => {
        const mail = document.getElementById("email").value;
        const pass = document.getElementById("password").value;
        if (!mail || !pass) return;
        try {
            await signInWithEmailAndPassword(auth, mail, pass);
        } catch (e) {
            try {
                await createUserWithEmailAndPassword(auth, mail, pass);
            } catch (err) {
                alert(err.message);
            }
        }
    };

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            info.innerText = user.displayName || user.email;
            status.innerText = "● Cloud Sync";
            status.style.color = "#22c55e";
            btnGoogle.style.display = "none";
            emailForm.style.display = "none";
            btnLogout.style.display = "block";

            const snap = await getDoc(doc(db, "proyectos", user.uid));
            if (snap.exists()) {
                const data = snap.data();
                ["html", "css", "js"].forEach(tipo => {
                    if (data["archivos_" + tipo]) {
                        archivos[tipo] = data["archivos_" + tipo];
                        indiceActual[tipo] = 0;
                        editores[tipo].setValue(archivos[tipo][0].content, -1);
                    }
                });
                guardarLocal();
                renderizarListasArchivos();
                ejecucionAutomatica();
            }
        } else {
            info.innerText = "Modo Local Activo";
            status.innerText = "● Local";
            status.style.color = "#ef4444";
            btnGoogle.style.display = "flex";
            emailForm.style.display = "block";
            btnLogout.style.display = "none";
        }
    });

    document.getElementById("btnSave").onclick = async () => {
        const user = auth.currentUser;
        if (!user) return alert("Inicia sesión para respaldar en la nube.");
        try {
            await setDoc(doc(db, "proyectos", user.uid), {
                archivos_html: archivos.html,
                archivos_css: archivos.css,
                archivos_js: archivos.js,
                time: new Date()
            });
            alert("Sincronización en la nube exitosa.");
        } catch (e) {
            alert("Error al guardar: " + e.message);
        }
    };
}

function configurarComplementos() {
    document.getElementById("btnToggleTheme").onclick = () => {
        const body = document.body;
        if (body.style.filter === "invert(1)") {
            body.style.filter = "none";
        } else {
            body.style.filter = "invert(1)";
        }
    };

    document.getElementById("btnDictionary").onclick = () => {
        alert("Lobo Diccionario:\n\nHTML: Estructura web básica\nCSS: Estilos visuales y efectos\nJS: Funcionalidad e interactividad\nPython: Scripts y lógica backend cliente.");
    };
}

window.onload = () => {
    inicializarEditores();
    configurarEntornos();
    configurarPaneles();
    configurarSidebar();
    configurarArchivosNuevos();
    configurarCopiar();
    configurarExportar();
    configurarResponsividad();
    configurarThanos();
    configurarFirebase();
    configurarComplementos();
};
