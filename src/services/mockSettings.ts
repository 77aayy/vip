import type { Prize, Settings } from '@/types'

export const defaultPrizes: Prize[] = [
  { id: '1', label: '500 نقطة', percent: 12, unlimited: true },
  { id: '2', label: 'خصم 10%', percent: 12, unlimited: true },
  { id: '3', label: 'مشروب مجاني', percent: 13, unlimited: true },
  { id: '4', label: 'ترقية غرفة', percent: 13, maxWins: 8 },
  { id: '5', label: 'وجبة خفيفة', percent: 12, unlimited: true },
  { id: '6', label: 'وجبة إفطار', percent: 13, unlimited: true },
  { id: '7', label: 'وجبة غداء', percent: 12, unlimited: true },
  { id: '8', label: 'توصيل مجاني', percent: 13, unlimited: true },
]

export const defaultSettings: Settings = {
  prizes: defaultPrizes,
  revenueToPoints: 1,
  pointsSilverToGold: 10000,
  pointsGoldToPlatinum: 12000,
  whatsAppNumber: '966500000000',
  instagramUrl: '',
  messages: {
    silver: 'أنت عميل فضي، معك {points} نقطة. الرجاء الاستمرار للوصول إلى {next} نقطة للانتقال إلى الذهبي.',
    gold: 'أنت عميل ذهبي، معك {points} نقطة. الرجاء الاستمرار للوصول إلى {next} نقطة للانتقال إلى البلاتيني.',
    platinum: 'أهلاً عميلنا العزيز، أنت الآن في أعلى فئة: البلاتيني.',
    registerPrompt: 'ما لقينا بياناتك 😢 .. سجل وابشر بالفضية! ',
    successReception: 'تم وصول الرسالة إلى الاستقبال بنجاح. توجه إلى الاستقبال لاستلام الجائزة.',
  },
}
