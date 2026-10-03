CREATE TABLE IF NOT EXISTS local_paths (
    folder_name VARCHAR(255) PRIMARY KEY,
    absolute_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_file_id INT,
    project_id INT NOT NULL,
    parent_id INT,
    name VARCHAR(500) NOT NULL,
    is_directory BOOLEAN DEFAULT 0,
    content TEXT,
    content_hash VARCHAR(64),
    version INT DEFAULT 1,
    local_path TEXT,
    is_dirty BOOLEAN DEFAULT 0,
    last_synced_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS file_sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_id VARCHAR(64) NOT NULL UNIQUE,
    project_id INT NOT NULL,
    file_id INT,
    operation_type VARCHAR(50) NOT NULL,
    payload TEXT,
    base_version INT,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS latex_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INT NOT NULL UNIQUE,
    compiler VARCHAR(50) DEFAULT 'pdflatex',
    main_file VARCHAR(255) DEFAULT 'main.tex',
    output_dir VARCHAR(255) DEFAULT 'output'
);
