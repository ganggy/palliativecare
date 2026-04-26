# Palliative Home Visit Command Center

ระบบนี้ออกแบบสำหรับงานเยี่ยมบ้าน Palliative ระหว่างโรงพยาบาล, รพ.สต. และ PCU โดยยึดเกณฑ์เบิกจ่าย สปสช. ที่ต้องมี

- กลุ่มโรคตามภาคผนวก 14
- รหัส `Z51.5` และ `Z71.8`
- รายการบริการ `30001`, `EVA001`, `CONS01`
- สิทธิ์ต้องเป็น `UCS` หรือ `WEL` โดยอิง `pttype.hipdata_code`
- การเยี่ยมบ้านพร้อม `Authentication`
- การเก็บภาพผู้ป่วยทุกครั้งที่เยี่ยม

## ฟังก์ชันหลัก

- ดึงรายชื่อผู้ป่วยเข้าเกณฑ์จาก HOSXP ตามพื้นที่รับผิดชอบของแต่ละ รพ.สต./PCU
- โรงพยาบาลลงทะเบียนเคส, ยกเลิกการลงทะเบียน และกำหนดวันเยี่ยมแรก
- แก้วันเยี่ยมได้ แต่ต้องอยู่ในช่วงเดือนเดียวกับรอบเยี่ยมเดิม
- หน่วยเยี่ยมบ้านบันทึกอาการ, รูปภาพ, authen code และ checklist ได้จากแท็บเล็ตหรือคอมพิวเตอร์
- มีคอมเมนต์ประสานงานระหว่างโรงพยาบาลกับหน่วยบริการ
- มีหน้าสรุปผลของแต่ละหน่วย และรายการเคสพร้อมเบิก
- นำเข้า REP/STM เพื่อแบ่งเงินให้แต่ละหน่วย โดยค่าเริ่มต้นตั้งไว้ 50%
- ดึงไฟล์นำเข้าได้ตรงจากโฟลเดอร์ `C:\TEMP\REP` และ `C:\TEMP\STM` (ปรับ path ได้จาก env)
- มีผู้ใช้งานพื้นฐานให้ครบ และสามารถเปลี่ยนชื่อที่แสดงภายหลังได้

## โครงสร้างฐานข้อมูล

1. สร้างฐาน `palliative` จากไฟล์ [database/palliative.sql](D:\palliativecare\database\palliative.sql)
2. ตารางหลักที่ใช้คือ
   - `palliative_units`
   - `palliative_users`
   - `palliative_registry`
   - `palliative_visits`
   - `palliative_comments`
   - `palliative_stm_batches`
   - `palliative_stm_rows`

## วิธีรัน

1. คัดลอก `.env.example` เป็น `.env.local`
2. ปรับค่าฐานข้อมูล `HOS` และ `PALLIATIVE`
3. ตรวจ path ไฟล์นำเข้า `REP_IMPORT_DIR` และ `STM_IMPORT_DIR` (ค่าเริ่มต้นคือ `C:\TEMP\REP` และ `C:\TEMP\STM`)
4. รันคำสั่ง `npm install`
5. ระหว่างพัฒนา รัน `npm run dev`
6. ถ้าต้องการเปิดให้เครื่องอื่นเข้าในวงแลนหรือผ่าน IP ได้ ให้เรียกผ่าน `http://<server-ip>:3000`

สำคัญ: ถ้าดึงโค้ดจาก GitHub ไปลงเครื่องใหม่ จะต้องสร้าง `.env.local` บนเครื่องนั้นเองทุกครั้ง เพราะไฟล์นี้ไม่ถูกเก็บใน Git

## วิธีเปิดใช้งานบนเซิร์ฟเวอร์

1. สร้าง production build ด้วย `npm run build`
2. รันบริการด้วย `npm run start`
3. เปิด firewall ของ Windows หรือ security group ให้เข้า port `3000`
4. ถ้าจะให้เข้าโดยไม่ต้องพิมพ์ `:3000` ให้ตั้ง reverse proxy เช่น nginx หรือ IIS ไปที่ `http://127.0.0.1:3000`
5. ตรวจว่าเครื่องเซิร์ฟเวอร์สามารถเชื่อมไปยัง MySQL host ตามค่าใน `.env.local` ได้จริง เช่น `192.168.2.254:3306`

ตัวอย่าง `.env.local` บนเครื่องเซิร์ฟเวอร์:

```env
HOS_DB_HOST=192.168.2.254
HOS_DB_PORT=3306
HOS_DB_USER=opd
HOS_DB_PASSWORD=opd
HOS_DB_NAME=hos

PALLIATIVE_DB_HOST=192.168.2.254
PALLIATIVE_DB_PORT=3306
PALLIATIVE_DB_USER=opd
PALLIATIVE_DB_PASSWORD=opd
PALLIATIVE_DB_NAME=palliative
```

ตัวอย่างเปิด firewall บน Windows:

```powershell
New-NetFirewallRule -DisplayName "Palliative Next.js 3000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
```

ถ้าใช้งานผ่าน `npm run dev` แล้วเข้าด้วย IP ไม่ได้ ให้เพิ่ม origin ที่อนุญาตใน `.env.local` เช่น

```env
ALLOWED_DEV_ORIGINS=147.50.107.211
```

ถ้ายังไม่ได้สร้างฐาน `palliative` ระบบจะ fallback ไปใช้ข้อมูลตัวอย่างในหน่วยความจำ แต่ฝั่งดึง candidate จาก HOSXP จะยังใช้งานได้เมื่อ config ครบ

## หมายเหตุการใช้งาน

- รอบเยี่ยมถูกล็อกให้อยู่ภายในช่วงเดือนของวันนัดเดิม เพื่อช่วยกันหลุดเกณฑ์เบิก
- ถ้าต้องบันทึกภาพจากมือถือหรือแท็บเล็ต ใช้งานผ่าน browser แล้วกดจากฟอร์มเยี่ยมบ้านได้ทันที
- ไฟล์ภาพจะถูกเก็บใน `public/uploads/visits/...`
