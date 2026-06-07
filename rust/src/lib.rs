use std::collections::HashSet;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;
use tiny_http::{Header, Method, Response, Server, StatusCode};
use url::form_urlencoded;

const LISTEN_STATE: &str = "0A";
const TERM_TIMEOUT: Duration = Duration::from_secs(1);
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const STARTUP_BROWSER_COMMAND: &str = "xdg-open";

#[derive(Debug, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone)]
pub struct BrowserEntry {
    pub command: String,
    pub allowed_url_prefix: String,
}

#[derive(Debug, Clone)]
pub struct IndexPage {
    pub title: String,
    pub loading_message: String,
    pub tab_aria_label: String,
    pub asset_version: String,
    pub shared_asset_base_url: String,
}

impl IndexPage {
    pub fn render(&self, template: &str) -> Vec<u8> {
        let asset_version_suffix = if self.asset_version.is_empty() {
            String::new()
        } else {
            format!("?v={}", escape_html(&self.asset_version))
        };
        let shared_base = if self.shared_asset_base_url.trim().is_empty() {
            "assets".to_string()
        } else {
            self.shared_asset_base_url.trim_end_matches('/').to_string()
        };
        template
            .replace("{{TITLE}}", &escape_html(&self.title))
            .replace("{{STATUS_MESSAGE}}", &escape_html(&self.loading_message))
            .replace("{{TAB_ARIA_LABEL}}", &escape_html(&self.tab_aria_label))
            .replace(
                "{{SHARED_STYLE_URL}}",
                &format!("{shared_base}/style.css{asset_version_suffix}"),
            )
            .replace(
                "{{SHARED_RUNTIME_URL}}",
                &format!("{shared_base}/stock-table.js{asset_version_suffix}"),
            )
            .replace(
                "{{SHARED_COLUMNS_URL}}",
                &format!("{shared_base}/columns.js{asset_version_suffix}"),
            )
            .replace("{{CHART_JS_URL}}", "https://cdn.jsdelivr.net/npm/chart.js")
            .replace(
                "{{SHARED_CF_CHART_URL}}",
                &format!("{shared_base}/cf-chart.js{asset_version_suffix}"),
            )
            .replace(
                "{{SHARED_BS_CHART_URL}}",
                &format!("{shared_base}/bs-chart.js{asset_version_suffix}"),
            )
            .replace(
                "{{APP_SCRIPT_URL}}",
                &format!("assets/app.js{asset_version_suffix}"),
            )
            .into_bytes()
    }
}

#[derive(Debug, Clone)]
pub struct ServeConfig {
    pub server: ServerConfig,
    pub static_root: PathBuf,
    pub shared_assets_root: PathBuf,
    pub index_template_path: PathBuf,
    pub index_page: IndexPage,
    pub api_path: String,
    pub api_payload: Value,
    pub yazi_base_dir: Option<PathBuf>,
    pub browser_entries: Vec<(String, BrowserEntry)>,
}

pub fn serve(config: ServeConfig) -> Result<(), String> {
    let template =
        fs::read_to_string(&config.index_template_path).map_err(|err| err.to_string())?;
    let mut index_page = config.index_page;
    if index_page.asset_version.is_empty() {
        index_page.asset_version = compute_asset_hash(&config.shared_assets_root);
    }
    let index_html = index_page.render(&template);
    let address = format!("{}:{}", config.server.host, config.server.port);
    release_port_if_needed(&config.server.host, config.server.port)?;
    let server = Server::http(&address).map_err(|err| err.to_string())?;
    println!("Serving on http://{address}");
    open_startup_browser(&format!("http://{address}"));

    for request in server.incoming_requests() {
        if request.method() != &Method::Get {
            respond_text(request, StatusCode(405), "Method not allowed")?;
            continue;
        }

        let raw_url = request.url().to_string();
        let path = raw_url.split('?').next().unwrap_or("/");
        if path == "/" {
            respond_bytes(
                request,
                StatusCode(200),
                "text/html; charset=utf-8",
                index_html.clone(),
            )?;
        } else if path == config.api_path {
            let body = serde_json::to_vec(&config.api_payload).map_err(|err| err.to_string())?;
            respond_bytes(
                request,
                StatusCode(200),
                "application/json; charset=utf-8",
                body,
            )?;
        } else if path == "/open" {
            handle_open(request, &raw_url, &config.browser_entries)?;
        } else if let Some(code) = path.strip_prefix("/open-yazi/") {
            handle_open_yazi(request, code, config.yazi_base_dir.as_deref())?;
        } else if let Some(filename) = path.strip_prefix("/assets/") {
            let asset = resolve_asset(filename, &[&config.static_root, &config.shared_assets_root]);
            match asset {
                Some(path) => {
                    let body = fs::read(&path).map_err(|err| err.to_string())?;
                    let mime = mime_guess::from_path(&path)
                        .first_or_octet_stream()
                        .essence_str()
                        .to_string();
                    respond_bytes(request, StatusCode(200), &mime, body)?;
                }
                None => respond_json_error(request, StatusCode(404), "Not found")?,
            }
        } else {
            respond_json_error(request, StatusCode(404), "Not found")?;
        }
    }
    Ok(())
}

fn release_port_if_needed(host: &str, port: u16) -> Result<(), String> {
    let pids = find_listening_pids(port)?;
    if pids.is_empty() {
        return Ok(());
    }

    println!("Port {host}:{port} is in use; stopping PIDs {pids:?}");
    stop_pids(&pids, StopMode::Graceful)?;
    if wait_for_port_release(port)? {
        println!("Released port {host}:{port}");
        return Ok(());
    }

    let remaining_pids = find_listening_pids(port)?;
    if !remaining_pids.is_empty() {
        println!("Port {host}:{port} is still in use; force killing PIDs {remaining_pids:?}");
        stop_pids(&remaining_pids, StopMode::Force)?;
    }

    if wait_for_port_release(port)? {
        println!("Released port {host}:{port}");
        return Ok(());
    }

    Err(format!("Failed to release TCP port {host}:{port}"))
}

fn wait_for_port_release(port: u16) -> Result<bool, String> {
    let deadline = Instant::now() + TERM_TIMEOUT;
    while Instant::now() < deadline {
        if find_listening_pids(port)?.is_empty() {
            return Ok(true);
        }
        thread::sleep(POLL_INTERVAL);
    }
    Ok(find_listening_pids(port)?.is_empty())
}

#[derive(Debug, Clone, Copy)]
enum StopMode {
    Graceful,
    Force,
}

#[cfg(target_os = "linux")]
fn find_listening_pids(port: u16) -> Result<Vec<u32>, String> {
    let socket_inodes = find_listening_socket_inodes(port)?;
    if socket_inodes.is_empty() {
        return Ok(Vec::new());
    }
    find_pids_by_socket_inodes(&socket_inodes)
}

#[cfg(target_os = "linux")]
fn find_listening_socket_inodes(port: u16) -> Result<HashSet<String>, String> {
    let proc_path = Path::new("/proc");
    if !proc_path.exists() {
        return Err("Cannot inspect listening sockets because /proc is not available".to_string());
    }

    let target_port_hex = format!("{port:04X}");
    let mut socket_inodes = HashSet::new();
    for tcp_path in [proc_path.join("net/tcp"), proc_path.join("net/tcp6")] {
        if !tcp_path.exists() {
            continue;
        }
        let content = fs::read_to_string(&tcp_path).map_err(|err| err.to_string())?;
        for line in content.lines().skip(1) {
            let fields = line.split_whitespace().collect::<Vec<_>>();
            if fields.len() < 10 {
                continue;
            }
            let Some((_, local_port_hex)) = fields[1].rsplit_once(':') else {
                continue;
            };
            if local_port_hex.eq_ignore_ascii_case(&target_port_hex) && fields[3] == LISTEN_STATE {
                socket_inodes.insert(fields[9].to_string());
            }
        }
    }
    Ok(socket_inodes)
}

#[cfg(target_os = "linux")]
fn find_pids_by_socket_inodes(socket_inodes: &HashSet<String>) -> Result<Vec<u32>, String> {
    let mut pids = HashSet::new();
    for proc_entry in fs::read_dir("/proc").map_err(|err| err.to_string())? {
        let Ok(proc_entry) = proc_entry else {
            continue;
        };
        let Ok(pid) = proc_entry.file_name().to_string_lossy().parse::<u32>() else {
            continue;
        };
        let fd_dir = proc_entry.path().join("fd");
        let Ok(fd_entries) = fs::read_dir(fd_dir) else {
            continue;
        };
        for fd_entry in fd_entries.flatten() {
            let Ok(target) = fs::read_link(fd_entry.path()) else {
                continue;
            };
            let target = target.to_string_lossy();
            if let Some(inode) = extract_socket_inode(&target)
                && socket_inodes.contains(inode)
            {
                pids.insert(pid);
                break;
            }
        }
    }
    let mut pids = pids.into_iter().collect::<Vec<_>>();
    pids.sort_unstable();
    Ok(pids)
}

#[cfg(target_os = "linux")]
fn extract_socket_inode(target: &str) -> Option<&str> {
    target.strip_prefix("socket:[")?.strip_suffix(']')
}

#[cfg(target_os = "linux")]
fn stop_pids(pids: &[u32], mode: StopMode) -> Result<(), String> {
    let signal = match mode {
        StopMode::Graceful => libc::SIGTERM,
        StopMode::Force => libc::SIGKILL,
    };
    for pid in pids {
        let result = unsafe { libc::kill(*pid as i32, signal) };
        if result == 0 {
            continue;
        }
        let err = std::io::Error::last_os_error();
        if err.kind() == std::io::ErrorKind::NotFound {
            continue;
        }
        return Err(format!("Failed to signal PID {pid}: {err}"));
    }
    Ok(())
}

#[cfg(windows)]
fn find_listening_pids(port: u16) -> Result<Vec<u32>, String> {
    let output = Command::new("netstat")
        .arg("-ano")
        .output()
        .map_err(|err| err.to_string())?;
    if !output.status.success() {
        return Err(format!("netstat -ano failed with {}", output.status));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_windows_netstat_pids(&stdout, port))
}

#[cfg(windows)]
fn parse_windows_netstat_pids(output: &str, port: u16) -> Vec<u32> {
    let mut pids = HashSet::new();
    for line in output.lines() {
        let parts = line.split_whitespace().collect::<Vec<_>>();
        if parts.len() < 5 || parts[0] != "TCP" || parts[3] != "LISTENING" {
            continue;
        }
        if !parts[1].ends_with(&format!(":{port}")) {
            continue;
        }
        if let Ok(pid) = parts[4].parse::<u32>()
            && pid != 0
        {
            pids.insert(pid);
        }
    }
    let mut pids = pids.into_iter().collect::<Vec<_>>();
    pids.sort_unstable();
    pids
}

#[cfg(windows)]
fn stop_pids(pids: &[u32], mode: StopMode) -> Result<(), String> {
    for pid in pids {
        let mut command = Command::new("taskkill");
        command.args(["/PID", &pid.to_string(), "/T"]);
        if matches!(mode, StopMode::Force) {
            command.arg("/F");
        }
        let status = command.status().map_err(|err| err.to_string())?;
        if !status.success() {
            return Err(format!("Failed to stop PID {pid}: {status}"));
        }
    }
    Ok(())
}

#[cfg(not(any(target_os = "linux", windows)))]
fn find_listening_pids(_port: u16) -> Result<Vec<u32>, String> {
    Err("Port release is only supported on Linux and Windows".to_string())
}

#[cfg(not(any(target_os = "linux", windows)))]
fn stop_pids(_pids: &[u32], _mode: StopMode) -> Result<(), String> {
    Err("Port release is only supported on Linux and Windows".to_string())
}

#[cfg(target_os = "windows")]
fn open_startup_browser(url: &str) {
    if let Err(err) = Command::new("cmd")
        .args(["/C", "start", "", url])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        println!("Failed to launch startup browser: {err}. Continuing without opening {url}");
    }
}

#[cfg(not(target_os = "windows"))]
fn open_startup_browser(url: &str) {
    match Command::new(STARTUP_BROWSER_COMMAND)
        .arg(url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(_) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            println!(
                "Startup browser '{STARTUP_BROWSER_COMMAND}' was not found; continuing without opening {url}"
            );
        }
        Err(err) => {
            println!(
                "Failed to launch startup browser '{STARTUP_BROWSER_COMMAND}': {err}. Continuing without opening {url}"
            );
        }
    }
}

fn handle_open(
    request: tiny_http::Request,
    raw_url: &str,
    entries: &[(String, BrowserEntry)],
) -> Result<(), String> {
    let query = raw_url
        .split_once('?')
        .map(|(_, query)| query)
        .unwrap_or("");
    let params: std::collections::HashMap<String, String> =
        form_urlencoded::parse(query.as_bytes())
            .into_owned()
            .collect();
    let Some(browser_key) = params.get("browser") else {
        return respond_json_error(request, StatusCode(400), "Missing browser or url parameter");
    };
    let Some(url) = params.get("url") else {
        return respond_json_error(request, StatusCode(400), "Missing browser or url parameter");
    };
    let Some((_, entry)) = entries.iter().find(|(key, _)| key == browser_key) else {
        return respond_json_error(request, StatusCode(400), "Unknown browser key");
    };
    if !url.starts_with(&entry.allowed_url_prefix) {
        return respond_json_error(request, StatusCode(400), "URL not allowed");
    }

    Command::new(&entry.command)
        .arg(url)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| err.to_string())?;
    respond_json_success(request, "Opened")
}

fn handle_open_yazi(
    request: tiny_http::Request,
    code: &str,
    base_dir: Option<&Path>,
) -> Result<(), String> {
    let Some(base_dir) = base_dir else {
        return respond_json_error(request, StatusCode(404), "Yazi integration not configured");
    };
    let Some(latest_dir) = latest_quarter_dir(base_dir)? else {
        return respond_json_error(request, StatusCode(404), "Handbook data not found");
    };
    let pdf_path = latest_dir.join(format!("{code}.pdf"));
    if !pdf_path.is_file() {
        return respond_json_error(request, StatusCode(404), "PDF not found");
    }

    Command::new("kitty")
        .args(["-e", "yazi"])
        .arg(pdf_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| err.to_string())?;
    respond_json_success(request, "Opened in yazi")
}

fn resolve_asset(filename: &str, roots: &[&Path]) -> Option<PathBuf> {
    for root in roots {
        let candidate = root.join(filename);
        if !candidate.is_file() {
            continue;
        }
        let Ok(candidate_resolved) = candidate.canonicalize() else {
            continue;
        };
        let Ok(root_resolved) = root.canonicalize() else {
            continue;
        };
        if candidate_resolved.starts_with(root_resolved) {
            return Some(candidate);
        }
    }
    None
}

fn latest_quarter_dir(base_dir: &Path) -> Result<Option<PathBuf>, String> {
    if !base_dir.is_dir() {
        return Ok(None);
    }
    let mut dirs = fs::read_dir(base_dir)
        .map_err(|err| err.to_string())?
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| name.len() == 6 && name.as_bytes()[4] == b'_')
        .collect::<Vec<_>>();
    dirs.sort();
    Ok(dirs.last().map(|name| base_dir.join(name)))
}

fn respond_text(request: tiny_http::Request, status: StatusCode, body: &str) -> Result<(), String> {
    respond_bytes(
        request,
        status,
        "text/plain; charset=utf-8",
        body.as_bytes().to_vec(),
    )
}

fn respond_json_success(request: tiny_http::Request, message: &str) -> Result<(), String> {
    let body = serde_json::json!({"success": true, "message": message});
    respond_bytes(
        request,
        StatusCode(200),
        "application/json; charset=utf-8",
        serde_json::to_vec(&body).map_err(|err| err.to_string())?,
    )
}

fn respond_json_error(
    request: tiny_http::Request,
    status: StatusCode,
    message: &str,
) -> Result<(), String> {
    let body = serde_json::json!({"error": message});
    respond_bytes(
        request,
        status,
        "application/json; charset=utf-8",
        serde_json::to_vec(&body).map_err(|err| err.to_string())?,
    )
}

fn respond_bytes(
    request: tiny_http::Request,
    status: StatusCode,
    content_type: &str,
    body: Vec<u8>,
) -> Result<(), String> {
    let header = Header::from_bytes("Content-Type", content_type).map_err(|_| "invalid header")?;
    request
        .respond(Response::new(
            status,
            vec![header],
            Cursor::new(body.clone()),
            Some(body.len()),
            None,
        ))
        .map_err(|err| err.to_string())
}

fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

const ASSET_FILES: &[&str] = &[
    "style.css",
    "stock-table.js",
    "columns.js",
    "cf-chart.js",
    "bs-chart.js",
];

fn compute_asset_hash(root: &Path) -> String {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    for name in ASSET_FILES {
        let path = root.join(name);
        if let Ok(data) = fs::read(&path) {
            data.hash(&mut hasher);
        }
    }
    format!("{:010x}", hasher.finish())
}

/* ------------------------------------------------------------------ */
/*  pyo3 bindings (feature = "python")                                 */
/* ------------------------------------------------------------------ */

#[cfg(feature = "python")]
mod python {
    use super::{IndexPage, compute_asset_hash};
    use pyo3::prelude::*;
    use std::path::Path;

    #[pyfunction]
    #[pyo3(signature = (template, title, loading_message, tab_aria_label, asset_version="", shared_asset_base_url="", shared_assets_root=""))]
    fn render_index_html(
        template: &str,
        title: &str,
        loading_message: &str,
        tab_aria_label: &str,
        asset_version: &str,
        shared_asset_base_url: &str,
        shared_assets_root: &str,
    ) -> PyResult<Vec<u8>> {
        let version = if asset_version.is_empty() && !shared_assets_root.is_empty() {
            compute_asset_hash(Path::new(shared_assets_root))
        } else {
            asset_version.to_string()
        };
        let page = IndexPage {
            title: title.to_string(),
            loading_message: loading_message.to_string(),
            tab_aria_label: tab_aria_label.to_string(),
            asset_version: version,
            shared_asset_base_url: shared_asset_base_url.to_string(),
        };
        Ok(page.render(template))
    }

    #[pyfunction]
    fn compute_asset_hash_py(shared_assets_root: &str) -> String {
        compute_asset_hash(Path::new(shared_assets_root))
    }

    #[pymodule]
    fn _core(m: &Bound<'_, PyModule>) -> PyResult<()> {
        m.add_function(wrap_pyfunction!(render_index_html, m)?)?;
        m.add_function(wrap_pyfunction!(compute_asset_hash_py, m)?)?;
        Ok(())
    }
}
