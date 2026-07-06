# Construction S-Curve · Project Controls

เว็บแอปควบคุมโครงการก่อสร้าง (S-curve, BOQ & cost, Material/Shop-drawing submittals, Dashboard)
ทำงานทั้งหมดในเบราว์เซอร์ ไม่มี server — ข้อมูลเก็บใน (1) เบราว์เซอร์ของคุณ และ (2) Google Drive ของคุณ

Stack: Vite + React + Recharts + lucide-react

---

## 1) รันบนเครื่อง (ถ้าจะลองก่อน — ไม่บังคับ)

ต้องมี Node.js 18+ แล้วสั่ง:

    npm install
    npm run dev

เปิด http://localhost:5173

---

## 2) เอาขึ้น GitHub + ทำหน้าเว็บ (GitHub Pages)

> ส่วนนี้ต้องทำในบัญชี GitHub ของคุณเอง (ผมทำแทนไม่ได้)

1. สร้าง repository ใหม่บน GitHub เช่นชื่อ `construction-controls`
2. อัปโหลด/พุชไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น branch `main`
   (ลากไฟล์วางในหน้า "uploading an existing file" ได้เลย หรือใช้ git:)

       git init
       git add .
       git commit -m "init"
       git branch -M main
       git remote add origin https://github.com/<USER>/<REPO>.git
       git push -u origin main

3. ไปที่ repo → **Settings → Pages → Build and deployment → Source = GitHub Actions**
4. Workflow ที่แถมมา (`.github/workflows/deploy.yml`) จะ build + deploy อัตโนมัติทุกครั้งที่ push เข้า `main`
5. รอ Actions เสร็จ เว็บจะอยู่ที่ **https://<USER>.github.io/<REPO>/**

(base ตั้งเป็น `"./"` แล้ว จึงใช้ได้กับทุก URL ของ Pages โดยไม่ต้องแก้)

---

## 3) เก็บข้อมูลใน Google Drive ของคุณ

> ต้องสร้าง OAuth Client ID ในบัญชี Google ของคุณเอง (ผมทำแทนไม่ได้ เพราะต้องใช้บัญชีคุณ)
> เพราะเว็บวิ่งในเบราว์เซอร์ล้วนๆ จึงคุยกับ Drive โดยตรงด้วย Client ID ของคุณ

ทำใน **Google Cloud Console** (https://console.cloud.google.com):

1. สร้าง/เลือก Project
2. **APIs & Services → Library →** เปิดใช้ **Google Drive API**
3. **OAuth consent screen →** เลือก **External →** กรอกชื่อแอป/อีเมล → เพิ่มอีเมล Google ของคุณใน **Test users**
4. **Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**
   - **Authorized JavaScript origins** ใส่ origin ของเว็บคุณ (แค่ scheme+host ไม่มี path):
     - `https://<USER>.github.io`
     - (ถ้ารันโลคัลด้วย) `http://localhost:5173`
5. คัดลอก **Client ID** (หน้าตา `xxxx.apps.googleusercontent.com`)

ในเว็บแอป: กดปุ่ม **Save / Cloud** (มุมขวาบน) → วาง Client ID →
**Connect Google Drive** (อนุมัติสิทธิ์) → ใช้ **Save to Drive / Load from Drive** ได้เลย

**หมายเหตุ**
- Scope คือ `drive.file` → แอปเห็น/แก้ได้เฉพาะไฟล์เดียวที่มันสร้างเอง (`construction-controls.json`) มองไฟล์อื่นใน Drive ไม่ได้
- ระหว่างที่ยังไม่ได้ตั้ง Google: แอป **autosave ลงเบราว์เซอร์** อยู่แล้ว และมีปุ่ม **Download .json / Open .json** สำรองข้อมูลได้
- Client ID ไม่ใช่ความลับ ออกแบบมาให้ฝังในโค้ดฝั่งเบราว์เซอร์ได้ตามปกติ

---

## ข้อมูล & ความเป็นส่วนตัว
ไม่มี backend / ไม่มีการส่งข้อมูลไปที่อื่น — อยู่ในเบราว์เซอร์คุณ + Drive คุณเท่านั้น
