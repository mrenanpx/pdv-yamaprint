// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      let handle = app.handle();
      tauri::async_runtime::spawn(async move {
        // Inicia o binário do python embutido como sidecar
        let _sidecar = handle.shell().sidecar("main").unwrap()
          .spawn()
          .expect("Falha ao iniciar o servidor backend local");
      });
      Ok(())
    })
    .run(tauri::generate_context())
    .expect("erro ao executar a aplicação tauri");
}