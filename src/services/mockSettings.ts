import type { Prize, Settings } from '@/types'

export const defaultPrizes: Prize[] = [
  { id: '2', label: 'خصم 10%', percent: 6.67, unlimited: true },
  { id: '3', label: 'مشروب مجاني', percent: 6.67, unlimited: true },
  { id: '4', label: 'ترقية غرفة', percent: 6.67, maxWins: 8 },
  { id: '5', label: 'وجبة إفطار', percent: 6.67, unlimited: true },
  { id: '7', label: 'ليلة مجانية', percent: 6.67, unlimited: true },
  { id: '8', label: 'خصم 15%', percent: 6.67, unlimited: true },
  { id: '9', label: 'جناح بالورود', percent: 6.67, unlimited: true },
  { id: '10', label: 'ميني بار', percent: 6.67, unlimited: true },
  { id: '11', label: 'قهوة عربي', percent: 6.67, unlimited: true },
  { id: '12', label: 'خروج متأخر', percent: 6.67, unlimited: true },
  { id: '14', label: '٢+١ ليلة', percent: 6.67, unlimited: true },
  { id: '15', label: 'ليلة + ليلة', percent: 6.67, unlimited: true },
]

export const defaultSettings: Settings = {
  prizes: defaultPrizes,
  revenueToPoints: 1,
  pointsSilverToGold: 10000,
  pointsGoldToPlatinum: 12000,
  whatsAppNumber: '966126076060',
  instagramUrl: '',
  messages: {
    silver: 'بداية فخمة يا {name}، أنت عميل فضي ومعك {points} نقطة. الرجاء الاستمرار للوصول إلى {next} نقطة للانتقال إلى الذهبي.',
    gold: 'يا {name}، فئتك ذهبية ومعك {points} نقطة. الرجاء الاستمرار للوصول إلى {next} نقطة للانتقال إلى البلاتيني.',
    platinum: 'أهلاً يا {name}، أنت الآن في أعلى فئة: البلاتيني.',
    registerPrompt: 'ما لقينا بياناتك 😢 .. سجل وابشر بالفضية! ',
    successReception: 'تم وصول رسالة {name} إلى الاستقبال بنجاح. توجه إلى الاستقبال لاستلام الجائزة.',
    /** للضيف له إيراد ولكن لم يسجل بعد — {totalSpent} المبلغ، {eligibleTier} الفئة المستحقة */
    eligibleNoTier: 'بلغ إجمالي تعاملاتك معنا {totalSpent} ريالاً، وأنت مؤهل لفئة {eligibleTier}. ندعوك لتجربة العجلة!',
  },
}
