CREATE TABLE IF NOT EXISTS local_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_id INTEGER UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    university TEXT,
    research_interests TEXT,
    cached_password_hash TEXT,
    last_login_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    central_id INTEGER UNIQUE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'ACTIVE',
    owner_id INTEGER NOT NULL,
    sync_status TEXT DEFAULT 'SYNCED', -- SYNCED, PENDING_CREATE, PENDING_UPDATE, PENDING_DELETE
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    central_id INTEGER UNIQUE,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    file_hash TEXT,
    sync_status TEXT DEFAULT 'SYNCED',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES local_projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    operation_type TEXT NOT NULL, -- PROJECT_CREATE, FILE_UPLOAD, etc.
    payload TEXT NOT NULL,        -- JSON representation of the data to sync
    status TEXT DEFAULT 'PENDING',-- PENDING, FAILED
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
