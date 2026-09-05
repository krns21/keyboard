/**
 * STS Keyboard — Google Apps Script API
 *
 * Deployment:
 * 1. Create a PRIVATE Google Sheet.
 * 2. Extensions → Apps Script.
 * 3. Replace Code.gs with this file.
 * 4. Run setupStudio() once from the Apps Script editor and approve permissions.
 * 5. Run createInitialAccessCodes() once if you want sample accounts.
 * 6. Deploy → New deployment → Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 * 7. Put the /exec URL into public/config.js as API_URL.
 *
 * IMPORTANT:
 * - Do not publish the spreadsheet. Access codes are stored as plain text in the
 *   Users sheet — this is fine because only you (the sheet owner) can ever open it.
 * - Do not put access codes in the website JavaScript.
 * - This endpoint only returns data permitted for the authenticated role.
 */

const SHEETS = {
  SETTINGS: "Settings",
  USERS: "Users",
  STUDENTS: "Students",
  SYLLABUS: "Syllabus",
  GRADES: "Grades",
  PRACTICE: "Practice",
  SIGNOFFS: "PracticeSignoffs",
  RESOURCES: "Resources",
  AUDIT: "Audit"
};

const SESSION_TTL_SECONDS = 60 * 60 * 6;
const MAX_LOGIN_ATTEMPTS = 10;
const LOGIN_WINDOW_SECONDS = 15 * 60;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData?.contents || "{}");
    const action = String(body.action || "");
    const result = route_(action, body);
    return json_(result);
  } catch (err) {
    console.error(err);
    return json_({ success:false, error: safeError_(err) });
  }
}

function doGet() {
  return json_({success:true, service:"STS Keyboard API", status:"ok"});
}

function route_(action, p) {
  switch(action) {
    case "login": return login_(p.accessCode);
    case "bootstrap": return bootstrap_(requireSession_(p.token));
    case "upsertSyllabus": return upsertSyllabus_(requireRole_(p.token, "teacher"), p.item);
    case "upsertStudent": return upsertStudent_(requireRole_(p.token, "teacher"), p.item);
    case "deleteStudent": return deleteStudent_(requireRole_(p.token, "teacher"), p.studentId);
    case "saveWeeklyGrades": return saveWeeklyGrades_(requireRole_(p.token, "teacher"), p.week, p.grades || []);
    case "signoffPractice": return signoffPractice_(requireRole_(p.token, "parent"), p.week);
    default: throw new Error("UNKNOWN_ACTION");
  }
}

function setupStudio() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const headers = {
    Settings:["key","value"],
    Users:["user_id","role","name","student_id","email","access_code","active"],
    Students:["student_id","first_name","last_name","level","parent_name","parent_email","student_email","active"],
    Syllabus:["week","term","title","piece","objectives","active"],
    Grades:["grade_id","student_id","week","lesson_date","grade","comment"],
    Practice:["practice_id","student_id","week","target_days","days_done","tasks","teacher_note"],
    PracticeSignoffs:["signoff_id","student_id","week","signed_at","signer_name","signer_email"],
    Resources:["resource_id","title","type","description","url","week"],
    Audit:["timestamp","user_id","action","detail"]
  };
  Object.keys(headers).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    if (sh.getLastRow() === 0) sh.getRange(1,1,1,headers[name].length).setValues([headers[name]]);
    sh.setFrozenRows(1);
  });
  setSetting_("current_week", "1");
  setSetting_("academic_year", "2026-27");
  setSetting_("studio_name", "STS Keyboard");
  return "Studio sheets are ready.";
}

function createInitialAccessCodes() {
  // Replace these before real use. Access codes are stored as plain text in the Users sheet
  // because the sheet itself is private — nobody but you can open it.
  const examples = [
    {user_id:"U_PARENT_001",role:"parent",name:"Sarah",student_id:"S001",code:"CHANGE-ME-PARENT"},
    {user_id:"U_STUDENT_001",role:"student",name:"Emma",student_id:"S001",code:"CHANGE-ME-STUDENT"},
    {user_id:"U_TEACHER_001",role:"teacher",name:"Teacher",student_id:"",code:"CHANGE-ME-TEACHER"}
  ];
  const sh = sheet_(SHEETS.USERS);
  examples.forEach(x => {
    sh.appendRow([x.user_id,x.role,x.name,x.student_id,"",x.code,true]);
  });
  return "Initial users created. Immediately replace their codes with real ones.";
}

function login_(rawCode) {
  const code = String(rawCode || "").trim();
  if (!code || code.length < 6 || code.length > 100) throw new Error("INVALID_CODE");

  const cache = CacheService.getScriptCache();
  const key = "login:" + code;
  const attempts = Number(cache.get(key) || 0);
  if (attempts >= MAX_LOGIN_ATTEMPTS) throw new Error("RATE_LIMITED");
  cache.put(key, String(attempts + 1), LOGIN_WINDOW_SECONDS);

  // Users columns: user_id, role, name, student_id, email, access_code, active
  const rows = values_(SHEETS.USERS);
  for (let i=0;i<rows.length;i++) {
    const [userId, role, name, studentId, , accessCode, active] = rows[i];
    if (String(active).toLowerCase() !== "true") continue;
    if (String(accessCode) !== code) continue;

    cache.remove(key);
    const token = Utilities.getUuid().replace(/-/g,"") + Utilities.getUuid().replace(/-/g,"");
    const expires = new Date(Date.now() + SESSION_TTL_SECONDS*1000).toISOString();
    cache.put("session:"+token, JSON.stringify({
      userId:String(userId),role:String(role),name:String(name),studentId:String(studentId||""),expiresAt:expires
    }), SESSION_TTL_SECONDS);
    audit_(userId,"login","Successful login");
    return {success:true,token:token,expiresAt:expires,user:{
      role:String(role),name:String(name),studentId:String(studentId||""),studentName:getStudentName_(String(studentId||""))
    }};
  }
  throw new Error("INVALID_CODE");
}

function requireSession_(token) {
  if (!token || typeof token !== "string" || token.length < 20) throw new Error("UNAUTHORIZED");
  const cached = CacheService.getScriptCache().get("session:"+token);
  if (!cached) throw new Error("SESSION_EXPIRED");
  const s = JSON.parse(cached);
  if (new Date(s.expiresAt).getTime() < Date.now()) throw new Error("SESSION_EXPIRED");
  return s;
}

function requireRole_(token, role) {
  const s = requireSession_(token);
  if (s.role !== role) throw new Error("FORBIDDEN");
  return s;
}

function bootstrap_(s) {
  const currentWeek = Number(getSetting_("current_week") || 1);
  const syllabus = values_(SHEETS.SYLLABUS).map(r => ({
    week:Number(r[0]),term:Number(r[1]),title:String(r[2]),piece:String(r[3]||""),
    objectives:splitList_(r[4]),active:String(r[5]).toLowerCase()!=="false"
  })).filter(x=>x.active).sort((a,b)=>a.week-b.week);

  const resources = values_(SHEETS.RESOURCES).map(r => ({
    id:String(r[0]),title:String(r[1]),type:String(r[2]),description:String(r[3]||""),url:String(r[4]||"#"),week:Number(r[5]||0)
  }));

  if (s.role === "teacher") {
    return {success:true,data:{
      currentWeek,syllabus,resources,students:teacherStudents_(),grades:[],
      practice:{week:currentWeek}
    }};
  }

  const studentId = s.studentId;
  if (!studentId) throw new Error("NO_STUDENT");
  const grades = values_(SHEETS.GRADES).filter(r=>String(r[1])===studentId)
    .map(r=>({week:Number(r[2]),date:String(r[3]||""),grade:Number(r[4]),comment:String(r[5]||"")})).sort((a,b)=>a.week-b.week);
  const practice = practiceFor_(studentId,currentWeek);
  const signoffs = values_(SHEETS.SIGNOFFS).filter(r=>String(r[1])===studentId)
    .map(r=>({week:Number(r[2]),signedAt:String(r[3]||""),signerName:String(r[4]||""),signerEmail:String(r[5]||"")}));
  return {success:true,data:{
    currentWeek,syllabus,resources,grades,practice,signoffs,
    user:{role:s.role,name:s.name,studentId,studentName:getStudentName_(studentId)}
  }};
}

function signoffPractice_(s, week) {
  const w = Number(week);
  const studentId = s.studentId;
  if (!studentId || !w) throw new Error("INVALID_REQUEST");
  const sh = sheet_(SHEETS.SIGNOFFS);
  const rows = values_(SHEETS.SIGNOFFS);
  const exists = rows.some(r=>String(r[1])===studentId && Number(r[2])===w);
  if (!exists) sh.appendRow([Utilities.getUuid(),studentId,w,new Date().toISOString(),s.name,""]);
  audit_(s.userId,"signoff","Practice confirmed for week "+w);
  return bootstrap_(s);
}

function upsertSyllabus_(s,item) {
  validateTeacher_(s);
  if (!item || !Number(item.week) || !String(item.title||"").trim()) throw new Error("INVALID_REQUEST");
  const sh=sheet_(SHEETS.SYLLABUS), rows=values_(SHEETS.SYLLABUS);
  const week=Number(item.week);
  const values=[week,Number(item.term||1),String(item.title),String(item.piece||""),list_(item.objectives||[]),true];
  let found=-1;
  for(let i=0;i<rows.length;i++) if(Number(rows[i][0])===week) {found=i+2;break;}
  if(found>0) sh.getRange(found,1,1,values.length).setValues([values]); else sh.appendRow(values);
  audit_(s.userId,"upsertSyllabus","Week "+week);
  return {success:true,syllabus:bootstrap_(s).data.syllabus};
}

function upsertStudent_(s,item) {
  validateTeacher_(s);
  if (!item || !String(item.id||"").trim() || !String(item.name||"").trim()) throw new Error("INVALID_REQUEST");
  const sh=sheet_(SHEETS.STUDENTS), rows=values_(SHEETS.STUDENTS), id=String(item.id).trim();
  const name=String(item.name).trim().split(/\s+/), first=name.shift()||"", last=name.join(" ");
  const values=[id,first,last,String(item.level||""),String(item.parent||""),String(item.parentEmail||""),String(item.studentEmail||""),item.active!==false];
  let found=-1;
  for(let i=0;i<rows.length;i++) if(String(rows[i][0])===id){found=i+2;break;}
  if(found>0) sh.getRange(found,1,1,values.length).setValues([values]); else sh.appendRow(values);
  audit_(s.userId,"upsertStudent",id);
  return {success:true};
}

function deleteStudent_(s,studentId) {
  validateTeacher_(s);
  const id=String(studentId||"").trim();
  if(!id) throw new Error("INVALID_REQUEST");
  const sh=sheet_(SHEETS.STUDENTS), rows=values_(SHEETS.STUDENTS);
  for(let i=0;i<rows.length;i++) {
    if(String(rows[i][0])===id) {
      sh.getRange(i+2,8).setValue(false);
      audit_(s.userId,"deleteStudent","Deactivated "+id);
      return {success:true};
    }
  }
  throw new Error("INVALID_REQUEST");
}

function saveWeeklyGrades_(s,week,grades) {
  validateTeacher_(s);
  const w=Number(week);
  if(!w || !Array.isArray(grades)) throw new Error("INVALID_REQUEST");
  const sh=sheet_(SHEETS.GRADES);
  const existing=values_(SHEETS.GRADES);
  const now=new Date().toISOString();

  grades.forEach(g=>{
    if(!g.id || g.grade==="" || g.grade==null) return;
    const grade=Number(g.grade);
    if(grade<0||grade>10) throw new Error("INVALID_GRADE");

    let rowNumber=-1;
    // One authoritative grade row per student/week. This makes teacher edits idempotent.
    for(let i=0;i<existing.length;i++) {
      if(String(existing[i][1])===String(g.id) && Number(existing[i][2])===w) {
        rowNumber=i+2;
        break;
      }
    }
    const values=[rowNumber>0 ? existing[rowNumber-2][0] : Utilities.getUuid(),String(g.id),w,now,grade,String(g.comment||"")];
    if(rowNumber>0) sh.getRange(rowNumber,1,1,values.length).setValues([values]);
    else sh.appendRow(values);
  });

  audit_(s.userId,"saveWeeklyGrades","Week "+w);
  return {success:true,students:teacherStudents_()};
}

function teacherStudents_() {
  const students=values_(SHEETS.STUDENTS).map(r=>({
    id:String(r[0]),name:[r[1],r[2]].filter(Boolean).join(" "),level:String(r[3]||""),
    parent:String(r[4]||""),parentEmail:String(r[5]||""),studentEmail:String(r[6]||""),
    active:String(r[7]).toLowerCase()!=="false"
  }));
  const week=Number(getSetting_("current_week")||1);
  return students.map(s=>{
    const gs=values_(SHEETS.GRADES).filter(r=>String(r[1])===s.id).sort((a,b)=>Number(a[2])-Number(b[2]));
    const latest=gs.length?Number(gs[gs.length-1][4]):null;
    const p=practiceFor_(s.id,week);
    const signed=values_(SHEETS.SIGNOFFS).some(r=>String(r[1])===s.id&&Number(r[2])===week);
    return {...s,week,latest,practice:(p.days||[]).filter(Boolean).length,signed};
  });
}

function practiceFor_(studentId,week) {
  const rows=values_(SHEETS.PRACTICE);
  for(let i=0;i<rows.length;i++) if(String(rows[i][1])===studentId && Number(rows[i][2])===Number(week)) {
    let days=String(rows[i][4]||"").split(",").map(x=>String(x).trim().toLowerCase()==="true");
    while(days.length<7) days.push(false);
    return {week:Number(week),target:Number(rows[i][3]||5),days,tasks:String(rows[i][5]||""),teacherNote:String(rows[i][6]||"")};
  }
  return {week:Number(week),target:5,days:[false,false,false,false,false,false,false],tasks:"Practice as assigned by your teacher.",teacherNote:""};
}

function getStudentName_(id) {
  if(!id) return "";
  const rows=values_(SHEETS.STUDENTS);
  for(const r of rows) if(String(r[0])===id) return [r[1],r[2]].filter(Boolean).join(" ");
  return "";
}

function setSetting_(key,value) {
  const sh=sheet_(SHEETS.SETTINGS), rows=values_(SHEETS.SETTINGS);
  for(let i=0;i<rows.length;i++) if(String(rows[i][0])===key){sh.getRange(i+2,2).setValue(value);return;}
  sh.appendRow([key,value]);
}
function getSetting_(key) {
  const rows=values_(SHEETS.SETTINGS);
  for(const r of rows) if(String(r[0])===key) return r[1];
  return "";
}
function splitList_(value) {
  return String(value||"").split(/\n|\|/).map(x=>x.trim()).filter(Boolean);
}
function list_(arr){return arr.map(x=>String(x).trim()).filter(Boolean).join("\n");}
function values_(name) {
  const sh=sheet_(name), last=sh.getLastRow();
  return last<2?[]:sh.getRange(2,1,last-1,sh.getLastColumn()).getValues();
}
function sheet_(name) {
  const sh=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if(!sh) throw new Error("MISSING_SHEET_"+name);
  return sh;
}
function audit_(userId,action,detail) {
  try { sheet_(SHEETS.AUDIT).appendRow([new Date().toISOString(),userId,action,detail]); } catch(e) {}
}
function validateTeacher_(s){if(s.role!=="teacher")throw new Error("FORBIDDEN");}
function safeError_(e) {
  const msg=String(e&&e.message||e||"ERROR");
  const allowed=["INVALID_CODE","RATE_LIMITED","UNAUTHORIZED","SESSION_EXPIRED","FORBIDDEN","NO_STUDENT","INVALID_REQUEST","INVALID_GRADE","UNKNOWN_ACTION"];
  return allowed.includes(msg)?msg:"SERVER_ERROR";
}
function json_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
