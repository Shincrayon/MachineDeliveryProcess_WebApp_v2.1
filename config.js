// Cấu hình kết nối Supabase — lấy ở Supabase > Project Settings > API
// anon public key được phép công khai: dữ liệu vẫn được khoá bằng đăng nhập + phân quyền (01_schema.sql).
// TUYỆT ĐỐI không dán "service_role key" vào đây.
window.APP_CONFIG = {
  SUPABASE_URL: 'https://jpuwhrvijokgrfwzmitg.supabase.co/',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwdXdocnZpam9rZ3Jmd3ptaXRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5OTM2NjQsImV4cCI6MjEwODU2OTY2NH0.DFoqQ7fWm9GUi6Md3ckRtbeiHrFGyUmNOgdu7pD505s'
};
