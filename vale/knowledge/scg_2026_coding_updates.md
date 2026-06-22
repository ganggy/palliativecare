# SCG 2569 Coding Updates

แหล่งอ้างอิง: `2.Kเอกสาร สมาคมเวช2569_SGCปรับปรุง.pdf`

## General Audit

- Coding audit ปีงบประมาณ 2569 อ้างอิง Standard Coding Guidelines 2017 และฉบับปรับปรุงปัจจุบัน
- SA version 2026 ประเมิน 2D1, 2D2, 3D1 และ 3D2
- แนวทางเปลี่ยนผ่านปี 2569 ระบุว่าบางรหัสที่ถูกยกเลิกตามฉบับปรับปรุง เช่น `R65` และ `Z21` ให้ตรวจตามแนวทางใหม่ แต่ไม่ต้องให้ error code 2b หรือ 2d เมื่อหน่วยบริการสรุปตาม SCG 2017 เดิม

## Diagnosis Relationships

- `R65` Systemic inflammatory response ไม่ควรใช้เป็นการวินิจฉัยร่วมตาม SCG ฉบับปรับปรุง ให้ประเมิน organ failure ตามระบบและสรุปรหัส organ failure แทน
- Sepsis ต้องมีภาวะติดเชื้อร่วมกับ quick SOFA อย่างน้อย 2 ใน 3 ข้อ ได้แก่ RR >= 22 ครั้งต่อนาที, GCS <= 14, SBP <= 100 mmHg
- `A41.9` Sepsis, unspecified ไม่ควรเป็น Pdx ตาม SCG ฉบับปรับปรุง ให้ใช้ source of organ infection หรือเชื้อตามระบบเป็น Pdx และใส่ sepsis เป็น Sdx
- Septic shock ใช้ `R57.2` และเมื่อไม่พบ source/เชื้อ แต่มี sepsis with septic shock ให้ `R57.2` เป็น Pdx และ `A41.9` เป็น Sdx
- `Z21` Asymptomatic HIV infection status ถูกยกเลิกการใช้ตาม SCG ฉบับปรับปรุง ให้ใช้รหัสกลุ่ม HIV disease ที่เหมาะสมแทน
- กลุ่มมะเร็ง: หากรับไว้รักษามะเร็งปฐมภูมิให้มะเร็งปฐมภูมิเป็น Pdx; หากรับไว้รักษามะเร็งทุติยภูมิ ให้มะเร็งทุติยภูมิเป็น Pdx และ primary site เป็น Sdx เมื่อทราบ
- CKD: stage 4-5 ควรระบุ stage ในผู้ป่วยในเมื่อมีระดับ GFR ตามเกณฑ์; `N19` ไม่ควรใช้เมื่อแยก acute/chronic renal failure ได้
- COPD: เมื่อ `J44.0` ร่วมกับการติดเชื้อปอด ต้องสัมพันธ์กับรหัสโรคติดเชื้อที่ปอด เช่น pneumonia

## Palliative App Relationship

- การคัดกรอง palliative ยังใช้รหัสสัมพันธ์หลัก `Z51.5` และ `Z71.8` เป็นคู่ร่วมกับบริการ `30001`, `EVA001`, `CONS01`, Authen code, home visit report และรูปเยี่ยมบ้าน
- Candidate diagnosis group ต้องครอบคลุมมะเร็ง/เนื้องอก, stroke/ระบบประสาท, dementia `F03`, CKD stage 5 `N18.5`, COPD `J44`, HIV/AIDS `B20-B24`, ตับล้มเหลว/ตับแข็ง `K72`, `K70.4`, `K71.7`, `K74`, heart failure `I50`, และ palliative Z-code `Z51.5`, `Z71.8`
