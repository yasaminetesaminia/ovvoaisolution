/**
 * Seed Lavora Clinic into the database.
 *
 * Run after `pnpm db:push` (or `db:migrate`) to bootstrap a fresh
 * Postgres instance with everything the demo needs:
 *   - one Clinic (Lavora)
 *   - 5 Doctors (Soraya / Neda / Hussein / Amani / Leila)
 *   - All ~30 services across 6 departments, with placeholder pricing
 *
 * Idempotent: re-running upserts everything by stable keys (slug for
 * the clinic, key for services, name for doctors). Existing data is
 * updated in place; nothing is duplicated.
 *
 *   pnpm --filter @lavora/db db:seed
 */

import { prisma } from "../src/client.js";

const CLINIC_SLUG = "lavora";

async function main() {
  console.log("→ Seeding Lavora Clinic...");

  // ============== Clinic ==============
  const clinic = await prisma.clinic.upsert({
    where: { slug: CLINIC_SLUG },
    update: {},
    create: {
      slug: CLINIC_SLUG,
      name: "Lavora Clinic",
      tagline: "Where Science, Beauty, and Longevity Meet",
      phone: "+968 7111 5617",
      email: "info@lavoraclinic.com",
      website: "lavoraclinic.om",
      addressEn:
        "18 November Street, Al Marafah Street, Building 123, Al Ghubrah Ash Shamaliyyah, Muscat, Oman",
      addressAr:
        "شارع 18 نوفمبر، شارع المعرفة، مبنى 123، الغبرة الشمالية، مسقط، سلطنة عمان",
      timezone: "Asia/Dubai",
      currency: "OMR",
      closedDay: "Friday",
      workingStart: "09:00",
      workingEnd: "22:00",
      plan: "trial",
    },
  });
  console.log(`✓ Clinic: ${clinic.name} (${clinic.id})`);

  // ============== Doctors ==============
  // Schema name → spec from the public Lavora brand brief.
  const doctorSpec: Array<{
    name: string;
    nameAr: string;
    title: string;
    specialties: string[];
  }> = [
    {
      name: "Dr. Soraya",
      nameAr: "الدكتورة ثريا",
      title: "Founder — Longevity Medicine & Regenerative Aesthetics",
      specialties: ["regenerative", "aesthetics"],
    },
    {
      name: "Dr. Neda",
      nameAr: "الدكتورة ندى",
      title: "Dermatology & Cosmetic Specialist",
      specialties: ["dermatology", "aesthetics"],
    },
    {
      name: "Dr. Hussein",
      nameAr: "الدكتور حسين",
      title: "Dermatology, Cosmetic & Laser Specialist",
      specialties: ["dermatology", "aesthetics"],
    },
    {
      name: "Dr. Amani",
      nameAr: "الدكتورة أماني",
      title: "Dermatology & Cosmetic Specialist",
      specialties: ["dermatology", "aesthetics"],
    },
    {
      name: "Dr. Leila",
      nameAr: "الدكتورة ليلى",
      title: "MD, OB/GYN Specialist (Aesthetic Gynecology)",
      specialties: ["gynecology"],
    },
  ];

  const doctors: Record<string, string> = {};
  for (const spec of doctorSpec) {
    // Find by clinic+name (no compound unique on (clinicId,name) so we
    // do a manual lookup → upsert; idempotent on re-runs).
    const existing = await prisma.doctor.findFirst({
      where: { clinicId: clinic.id, name: spec.name },
    });
    const doc = existing
      ? await prisma.doctor.update({
          where: { id: existing.id },
          data: spec,
        })
      : await prisma.doctor.create({
          data: { clinicId: clinic.id, ...spec },
        });
    doctors[spec.name] = doc.id;
    console.log(`✓ Doctor: ${doc.name}`);
  }

  // ============== Services ==============
  // Pricing here is PLACEHOLDER — replace with the real Lavora card
  // before going live. Stored in MINOR units (baisa) to avoid float
  // drift; 1 OMR = 1000 baisa.
  type Svc = {
    department: string;
    key: string;
    nameEn: string;
    nameAr: string;
    durationMinutes: number;
    priceOmr: number;
    priceUnit?: string;
    capacity?: number;
    doctors?: string[]; // doctor names; converted to ids below
  };

  const services: Svc[] = [
    // ---- Dermatology & Medical Skin Care ----
    { department: "dermatology", key: "frax_pro", nameEn: "Frax Pro Laser", nameAr: "ليزر فراكس برو", durationMinutes: 45, priceOmr: 180, capacity: 2, doctors: ["Dr. Hussein", "Dr. Neda", "Dr. Amani"] },
    { department: "dermatology", key: "picoway", nameEn: "Picoway Laser", nameAr: "ليزر بيكوواي", durationMinutes: 45, priceOmr: 200, capacity: 2, doctors: ["Dr. Hussein", "Dr. Neda", "Dr. Amani"] },
    { department: "dermatology", key: "redtouch", nameEn: "RedTouch Laser", nameAr: "ليزر ريد تاتش", durationMinutes: 30, priceOmr: 150, capacity: 2, doctors: ["Dr. Hussein", "Dr. Neda", "Dr. Amani"] },
    { department: "dermatology", key: "skin_resurfacing", nameEn: "Skin Resurfacing", nameAr: "تجديد البشرة", durationMinutes: 45, priceOmr: 160, capacity: 2, doctors: ["Dr. Hussein", "Dr. Neda", "Dr. Amani"] },
    { department: "dermatology", key: "chemical_peel", nameEn: "Chemical Peel", nameAr: "التقشير الكيميائي", durationMinutes: 30, priceOmr: 90, capacity: 2, doctors: ["Dr. Hussein", "Dr. Neda", "Dr. Amani"] },
    { department: "dermatology", key: "scar_stretch_mark", nameEn: "Scar & Stretch Mark Treatment", nameAr: "علاج الندبات وعلامات التمدد", durationMinutes: 45, priceOmr: 140, capacity: 2, doctors: ["Dr. Hussein", "Dr. Neda", "Dr. Amani"] },
    { department: "dermatology", key: "vascular_laser", nameEn: "Vascular Laser", nameAr: "ليزر الأوعية الدموية", durationMinutes: 30, priceOmr: 130, capacity: 2, doctors: ["Dr. Hussein", "Dr. Neda", "Dr. Amani"] },

    // ---- Non-Surgical Aesthetics ----
    { department: "aesthetics", key: "botox", nameEn: "Botox", nameAr: "بوتوكس", durationMinutes: 30, priceOmr: 150, priceUnit: "per area", capacity: 2, doctors: ["Dr. Soraya", "Dr. Neda", "Dr. Hussein", "Dr. Amani"] },
    { department: "aesthetics", key: "dermal_filler", nameEn: "Dermal Filler", nameAr: "فيلر", durationMinutes: 45, priceOmr: 180, priceUnit: "per syringe", capacity: 2, doctors: ["Dr. Soraya", "Dr. Neda", "Dr. Hussein", "Dr. Amani"] },
    { department: "aesthetics", key: "profhilo", nameEn: "Profhilo Skinbooster", nameAr: "بروفايلو", durationMinutes: 30, priceOmr: 220, capacity: 2, doctors: ["Dr. Soraya", "Dr. Neda", "Dr. Hussein", "Dr. Amani"] },
    { department: "aesthetics", key: "polynucleotides", nameEn: "Polynucleotides Skinbooster", nameAr: "بولينوكليوتيدات", durationMinutes: 30, priceOmr: 250, capacity: 2, doctors: ["Dr. Soraya", "Dr. Neda", "Dr. Hussein", "Dr. Amani"] },
    { department: "aesthetics", key: "korean_thread_lift", nameEn: "Korean Thread Lift", nameAr: "شد الوجه بالخيوط الكورية", durationMinutes: 60, priceOmr: 300, capacity: 2, doctors: ["Dr. Neda", "Dr. Hussein", "Dr. Amani"] },
    { department: "aesthetics", key: "aptos_thread_lift", nameEn: "Aptos Thread Lift", nameAr: "شد الوجه بخيوط أبتوس", durationMinutes: 75, priceOmr: 400, capacity: 2, doctors: ["Dr. Neda", "Dr. Hussein", "Dr. Amani"] },
    { department: "aesthetics", key: "endolift", nameEn: "Endolift", nameAr: "إندوليفت", durationMinutes: 60, priceOmr: 450, capacity: 1, doctors: ["Dr. Hussein", "Dr. Amani"] },
    { department: "aesthetics", key: "fotona_4d", nameEn: "Fotona 4D Facial Lifting", nameAr: "فوتونا فور دي لشد الوجه", durationMinutes: 60, priceOmr: 280, capacity: 1, doctors: ["Dr. Hussein", "Dr. Amani"] },

    // ---- Regenerative & Cellular Therapies (Dr. Soraya) ----
    { department: "regenerative", key: "prp", nameEn: "PRP (Platelet-Rich Plasma)", nameAr: "بلازما الصفائح الدموية الغنية", durationMinutes: 45, priceOmr: 180, capacity: 1, doctors: ["Dr. Soraya"] },
    { department: "regenerative", key: "mesotherapy", nameEn: "Mesotherapy", nameAr: "الميزوثيرابي", durationMinutes: 45, priceOmr: 150, capacity: 1, doctors: ["Dr. Soraya"] },
    { department: "regenerative", key: "exosome_therapy", nameEn: "Exosome Therapy", nameAr: "علاج الإكسوسومات", durationMinutes: 60, priceOmr: 350, capacity: 1, doctors: ["Dr. Soraya"] },
    { department: "regenerative", key: "stem_cell_fat_transfer", nameEn: "Stem Cell Fat Transfer", nameAr: "نقل الدهون بالخلايا الجذعية", durationMinutes: 90, priceOmr: 800, capacity: 1, doctors: ["Dr. Soraya"] },

    // ---- Body Slimming (technician) ----
    { department: "slimming", key: "onda_plus", nameEn: "Onda Plus", nameAr: "أوندا بلس", durationMinutes: 60, priceOmr: 90, capacity: 2 },
    { department: "slimming", key: "redustim", nameEn: "Redustim", nameAr: "ريدوستيم", durationMinutes: 45, priceOmr: 70, capacity: 2 },
    { department: "slimming", key: "body_wrap", nameEn: "Body Wrap", nameAr: "لفائف الجسم", durationMinutes: 60, priceOmr: 50, capacity: 2 },

    // ---- Aesthetic Gynecology (Dr. Leila) ----
    { department: "gynecology", key: "vaginal_rejuvenation", nameEn: "Vaginal Rejuvenation", nameAr: "تجديد المهبل", durationMinutes: 45, priceOmr: 250, capacity: 1, doctors: ["Dr. Leila"] },
    { department: "gynecology", key: "pelvic_floor", nameEn: "Pelvic Floor Strengthening", nameAr: "تقوية قاع الحوض", durationMinutes: 30, priceOmr: 120, capacity: 1, doctors: ["Dr. Leila"] },
    { department: "gynecology", key: "intimate_rejuvenation", nameEn: "Non-Surgical Intimate Rejuvenation", nameAr: "تجديد المنطقة الحساسة دون جراحة", durationMinutes: 45, priceOmr: 200, capacity: 1, doctors: ["Dr. Leila"] },
    { department: "gynecology", key: "vaginoplasty", nameEn: "Vaginoplasty (Surgical)", nameAr: "تجميل المهبل (جراحي)", durationMinutes: 120, priceOmr: 1500, capacity: 1, doctors: ["Dr. Leila"] },
    { department: "gynecology", key: "labiaplasty", nameEn: "Labiaplasty (Surgical)", nameAr: "تجميل الشفرين (جراحي)", durationMinutes: 90, priceOmr: 1200, capacity: 1, doctors: ["Dr. Leila"] },

    // ---- Laser Hair Removal (technician) ----
    { department: "laser_hair_removal", key: "lhr_bikini", nameEn: "Bikini Laser", nameAr: "ليزر البكيني", durationMinutes: 15, priceOmr: 25, capacity: 4 },
    { department: "laser_hair_removal", key: "lhr_underarms", nameEn: "Underarms Laser", nameAr: "ليزر تحت الإبط", durationMinutes: 15, priceOmr: 20, capacity: 4 },
    { department: "laser_hair_removal", key: "lhr_face", nameEn: "Face Laser", nameAr: "ليزر الوجه", durationMinutes: 20, priceOmr: 30, capacity: 4 },
    { department: "laser_hair_removal", key: "lhr_legs", nameEn: "Legs Laser", nameAr: "ليزر الساقين", durationMinutes: 30, priceOmr: 50, capacity: 4 },
    { department: "laser_hair_removal", key: "lhr_arms", nameEn: "Arms Laser", nameAr: "ليزر الذراعين", durationMinutes: 25, priceOmr: 40, capacity: 4 },
    { department: "laser_hair_removal", key: "lhr_full_body_w", nameEn: "Full Body Laser (Women)", nameAr: "ليزر كامل الجسم للسيدات", durationMinutes: 60, priceOmr: 120, capacity: 4 },
    { department: "laser_hair_removal", key: "lhr_full_body_m", nameEn: "Full Body Laser (Men)", nameAr: "ليزر كامل الجسم للرجال", durationMinutes: 60, priceOmr: 130, capacity: 4 },
  ];

  for (const svc of services) {
    const doctorIds = (svc.doctors ?? []).map((n) => doctors[n]).filter(Boolean) as string[];
    await prisma.service.upsert({
      where: { clinicId_key: { clinicId: clinic.id, key: svc.key } },
      update: {
        department: svc.department,
        nameEn: svc.nameEn,
        nameAr: svc.nameAr,
        durationMinutes: svc.durationMinutes,
        priceMinor: Math.round(svc.priceOmr * 1000),
        priceUnit: svc.priceUnit ?? null,
        capacity: svc.capacity ?? 1,
        doctorIds,
      },
      create: {
        clinicId: clinic.id,
        department: svc.department,
        key: svc.key,
        nameEn: svc.nameEn,
        nameAr: svc.nameAr,
        durationMinutes: svc.durationMinutes,
        priceMinor: Math.round(svc.priceOmr * 1000),
        priceUnit: svc.priceUnit ?? null,
        capacity: svc.capacity ?? 1,
        doctorIds,
      },
    });
  }
  console.log(`✓ ${services.length} services across ${new Set(services.map((s) => s.department)).size} departments`);

  console.log("\n✅ Seed complete.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
