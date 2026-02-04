import type { Prize, Settings } from '@/types'

export const defaultPrizes: Prize[] = [
  { id: '1', label: '500 نقطة', percent: 6, unlimited: true },
  { id: '2', label: 'خصم 10%', percent: 6, unlimited: true },
  { id: '3', label: 'مشروب مجاني', percent: 6, unlimited: true },
  { id: '4', label: 'ترقية غرفة', percent: 6, maxWins: 8 },
  { id: '5', label: 'وجبة إفطار', percent: 6, unlimited: true },
  { id: '6', label: 'وجبة غداء', percent: 6, unlimited: true },
  { id: '7', label: 'ليلة مجانية', percent: 6, unlimited: true },
  { id: '8', label: 'خصم 15%', percent: 6, unlimited: true },
  { id: '9', label: 'جناح بالورود', percent: 6, unlimited: true },
  { id: '10', label: 'ميني بار', percent: 6, unlimited: true },
  { id: '11', label: 'قهوة عربي', percent: 6, unlimited: true },
  { id: '12', label: 'خروج متأخر', percent: 6, unlimited: true },
  { id: '13', label: 'ليلة+هدية', percent: 6, unlimited: true },
  { id: '14', label: 'ليلتان+الثالثة هدية', percent: 6, unlimited: true },
  { id: '15', label: 'إليت ذهبي', percent: 6, unlimited: true },
  { id: '16', label: 'إليت فضيّ', percent: 6, unlimited: true },
]

export const defaultSettings: Settings = {
  prizes: defaultPrizes,
  revenueToPoints: 1,
  pointsSilverToGold: 10000,
  pointsGoldToPlatinum: 12000,
  whatsAppNumber: '966126076060',
  instagramUrl: '',
  messages: {
    silver: 'أنت عميل فضي، معك {points} نقطة. الرجاء الاستمرار للوصول إلى {next} نقطة للانتقال إلى الذهبي.',
    gold: 'أنت عميل ذهبي، معك {points} نقطة. الرجاء الاستمرار للوصول إلى {next} نقطة للانتقال إلى البلاتيني.',
    platinum: 'أهلاً عميلنا العزيز، أنت الآن في أعلى فئة: البلاتيني.',
    registerPrompt: 'ما لقينا بياناتك 😢 .. سجل وابشر بالفضية! ',
    successReception: 'تم وصول الرسالة إلى الاستقبال بنجاح. توجه إلى الاستقبال لاستلام الجائزة.',
  },
}
