/* =====================================================================
   Avaya Support Assistant: database schema
   Run this on an EMPTY database. Choose the target database first
   (do not add USE or CREATE DATABASE here; Azure SQL does not allow USE).
   Safe to run again: tables are only created if they do not exist yet.
   ===================================================================== */

/* ---------- users ---------- */
IF OBJECT_ID(N'dbo.users', N'U') IS NULL
CREATE TABLE dbo.users (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  email         NVARCHAR(255) NOT NULL UNIQUE,
  password_hash NVARCHAR(255) NOT NULL,
  role          NVARCHAR(20)  NOT NULL
                CONSTRAINT DF_users_role DEFAULT 'customer'
                CONSTRAINT CK_users_role CHECK (role IN ('customer', 'agent')),
  created_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- conversations (a deleted chat is hidden, not removed) ---------- */
IF OBJECT_ID(N'dbo.conversations', N'U') IS NULL
CREATE TABLE dbo.conversations (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
  title      NVARCHAR(200) NOT NULL DEFAULT 'New chat',
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  deleted_at DATETIME2 NULL
);
GO

/* ---------- messages (the chat with the AI) ---------- */
IF OBJECT_ID(N'dbo.messages', N'U') IS NULL
CREATE TABLE dbo.messages (
  id              INT IDENTITY(1,1) PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES dbo.conversations(id) ON DELETE CASCADE,
  role            NVARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
  content         NVARCHAR(MAX) NOT NULL,
  created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- cases ---------- */
IF OBJECT_ID(N'dbo.cases', N'U') IS NULL
CREATE TABLE dbo.cases (
  id              INT IDENTITY(1,1) PRIMARY KEY,
  user_id         INT NOT NULL REFERENCES dbo.users(id),
  conversation_id INT NULL REFERENCES dbo.conversations(id),
  title           NVARCHAR(200) NOT NULL,
  description     NVARCHAR(MAX) NOT NULL,
  severity        NVARCHAR(20) NOT NULL DEFAULT 'medium'
                  CHECK (severity IN ('low', 'medium', 'high', 'urgent')),
  status          NVARCHAR(20) NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to     INT NULL REFERENCES dbo.users(id),
  created_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- internal notes (agents only, never shown to customers) ---------- */
IF OBJECT_ID(N'dbo.case_notes', N'U') IS NULL
CREATE TABLE dbo.case_notes (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  case_id    INT NOT NULL REFERENCES dbo.cases(id),
  author_id  INT NOT NULL REFERENCES dbo.users(id),
  note       NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- conversation between the customer and an agent on a case ---------- */
IF OBJECT_ID(N'dbo.case_messages', N'U') IS NULL
CREATE TABLE dbo.case_messages (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  case_id     INT NOT NULL REFERENCES dbo.cases(id) ON DELETE CASCADE,
  sender_id   INT NOT NULL REFERENCES dbo.users(id),
  sender_role NVARCHAR(20) NOT NULL CHECK (sender_role IN ('customer', 'agent')),
  body        NVARCHAR(MAX) NOT NULL,
  created_at  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- knowledge base ---------- */
IF OBJECT_ID(N'dbo.kb_articles', N'U') IS NULL
CREATE TABLE dbo.kb_articles (
  id         INT IDENTITY(1,1) PRIMARY KEY,
  title      NVARCHAR(200) NOT NULL,
  content    NVARCHAR(MAX) NOT NULL,
  keywords   NVARCHAR(500) NOT NULL DEFAULT '',
  is_sample  BIT NOT NULL DEFAULT 1,
  is_active  BIT NOT NULL DEFAULT 1,
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

/* ---------- indexes (speed only, they do not change behaviour) ---------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_conversations_user' AND object_id = OBJECT_ID(N'dbo.conversations'))
  CREATE INDEX IX_conversations_user ON dbo.conversations (user_id, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_messages_conversation' AND object_id = OBJECT_ID(N'dbo.messages'))
  CREATE INDEX IX_messages_conversation ON dbo.messages (conversation_id, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_cases_user' AND object_id = OBJECT_ID(N'dbo.cases'))
  CREATE INDEX IX_cases_user ON dbo.cases (user_id, id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_case_notes_case' AND object_id = OBJECT_ID(N'dbo.case_notes'))
  CREATE INDEX IX_case_notes_case ON dbo.case_notes (case_id);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_case_messages_case_id' AND object_id = OBJECT_ID(N'dbo.case_messages'))
  CREATE INDEX IX_case_messages_case_id ON dbo.case_messages (case_id, id);
GO

/* ---------- starter knowledge base articles (SAMPLE content) ----------
   Replace these with official Avaya information before real use.
   They are only inserted when the table is empty. */
IF NOT EXISTS (SELECT 1 FROM dbo.kb_articles)
INSERT INTO dbo.kb_articles (title, content, keywords) VALUES
(N'Support channels and hours',
 N'Critical (Severity 1) issues: support is available 24 hours a day, 7 days a week. Other issues: support is available during business hours on working days. Customers can raise an issue through this assistant, the support portal or their account manager.',
 N'support hours channels contact business hours 24x7 portal account manager'),

(N'Severity levels',
 N'Severity 1 (Critical): the contact centre is down or most customers cannot reach agents. Severity 2 (High): a major feature is unavailable or performance is badly degraded, but a workaround exists. Severity 3 (Medium): a feature is not working as expected and the impact is limited. Severity 4 (Low): general questions, minor issues or feature requests.',
 N'severity priority critical high medium low urgent levels'),

(N'What to prepare before opening a case',
 N'Company name, contact details, the product and version if known, a clear description of the problem, the exact time it started, how many users are affected, any error messages or screenshots, and what has already been tried.',
 N'open case ticket prepare details information required'),

(N'Agents cannot log in',
 N'Ask the customer to check: the username and password are typed correctly, the network or VPN connection is working, and the account has not been locked or disabled. Ask for the exact error message and the time it happened. Password resets and account unlocks are done by the customer''s own system administrator.',
 N'login log in sign in password locked account disabled cannot access agent'),

(N'One-way audio or no audio on calls',
 N'Check that the correct headset or audio device is selected, test with a different headset, check that the connection is on a stable network (wired is better than Wi-Fi), and check whether a firewall or VPN is interfering with voice traffic. Collect the time of an example call and the numbers involved.',
 N'audio one-way no audio cannot hear silence headset microphone voice rtp firewall vpn'),

(N'Poor or choppy call quality',
 N'Common causes are limited bandwidth, an unstable Wi-Fi connection, VPN overhead and network congestion. Ask whether it affects one agent or many, and at what times of day. Network quality settings (QoS) are managed by the customer''s network team.',
 N'choppy poor quality jitter robotic delay lag breaking up bandwidth wifi qos'),

(N'Calls not reaching agents or queues look wrong',
 N'Check that agents are in a Ready state, are assigned to the correct queue or skill, and that the routing settings have not been changed recently. Collect the queue name, the time of the problem and a few example calls. Routing changes are made by the customer''s administrator.',
 N'calls not reaching agents queue routing skill ready state not receiving calls'),

(N'Reports or dashboards missing data',
 N'Check the selected date range and filters, check that the user has permission to see the data, and allow for refresh delays in dashboards. Ask for the report name, the date range and what the customer expected to see.',
 N'report dashboard missing data empty wrong numbers filter date range permission'),

(N'Software upgrades and patches',
 N'Upgrades should be planned in a maintenance window, with a backup taken first. For upgrade plans, versions and compatibility, the customer should contact their account manager or the support team. Do not state specific version numbers.',
 N'upgrade update patch version maintenance window backup compatibility'),

(N'Licences and contracts',
 N'This assistant cannot change licences or discuss contract terms or pricing. Pass these questions to a human agent or the customer''s account manager.',
 N'licence license contract pricing price cost renewal quote');
GO

/* ---------- after creating your first account on the website ----------
   To make a person an agent, run this with their email (it cannot be done
   from the website, on purpose):

   UPDATE dbo.users SET role = 'agent' WHERE email = 'you@example.com';
   ---------------------------------------------------------------------- */