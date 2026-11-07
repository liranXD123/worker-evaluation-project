/** משתמשי הדגמה מתוך נתוני ה-seed – לכפתורי הכניסה המהירה במצב הדגמה */
export const DEMO_ACCOUNTS = [
  { email: "hr.admin@example.com", name: "מיכל אברהם", role: "מנהלת HR", hint: "דשבורד, מחזורים, עובדים, שאלונים ודוחות" },
  { email: "ronit.mizrahi@example.com", name: "רונית מזרחי", role: "מנהלת", hint: "הצוות שלי, הערכת מנהל ודוח השוואתי" },
  { email: "roei.hadad@example.com", name: "רועי חדד", role: "עובד", hint: "מילוי הערכה עצמית" },
  { email: "noa.friedman@example.com", name: "נועה פרידמן", role: "עובדת", hint: "תהליך שהושלם: משוב ויעדים" },
] as const;
