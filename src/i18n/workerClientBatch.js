export const workerClientBatchArabic = {
  title: 'اختيار طلبات الفصالة', hint: 'اختر طلبًا أو عدة طلبات، ثم حدّد القطع المطلوبة في كل طلب. يُسجّل كل طلب كعمل مستقل لدى العامل.',
  search: 'البحث باسم الزبون أو الهاتف أو باركود الطلب…', selectAll: 'اختيار الطلبات المتاحة في النتائج', clear: 'إلغاء الاختيار',
  selected: '{{orders}} طلب · {{pieces}} قطعة مختارة', available: '{{count}} قطعة متاحة', limit: 'يمكن اختيار {{count}} طلبًا في المرة الواحدة.',
  empty: 'لا توجد طلبات مطابقة للبحث.', selectOrder: 'اختيار طلب {{name}}', wage: 'أجرة هذا الطلب لكل قطعة', sfifaWage: 'أجرة هذا الطلب لكل متر',
  overrideHint: 'اختياري؛ تُستخدم الأجرة الافتراضية عند تركه فارغًا.', commonWageHint: 'أجرة افتراضية للطلبات المختارة. يمكنك تخصيص أجرة داخل كل طلب.',
  meters: 'أمتار السفيفة لهذا الطلب', commonMeters: 'الأمتار الافتراضية لكل طلب', metersHint: 'يمكن تحديد عدد مختلف من الأمتار داخل كل طلب.',
  sfifaHint: 'نوع السفيفة وفئتها ورقمها المحدّد أدناه يطبّق على الطلبات المختارة. لا يُضاف إنجاز أعمال الزبائن إلى المخزون.',
  linkOrders: 'ربط العمل بطلبات الفصالة', saved: 'تم إسناد الطلب', saving: 'جارٍ إسناد الطلب…', uncertain: 'تعذّر تأكيد الحفظ. أعد المحاولة لتأكيد الطلب نفسه دون تكراره.',
  partial: 'تم إسناد {{count}} طلب. راجع الطلبات التي لم تُحفظ، ثم أعد المحاولة. لن تتكرر الطلبات المحفوظة.',
  save: 'إسناد الطلبات المختارة', retry: 'حفظ الطلبات المتبقية', chooseOrders: 'اختر طلبًا واحدًا على الأقل، وبحد أقصى 50 طلبًا.', done: 'تم إسناد {{count}} طلب إلى العامل.',
};
export const workerClientBatchFrench = {
  title: 'Choisir les commandes de confection', hint: 'Sélectionnez une ou plusieurs commandes, puis leurs pièces. Chaque commande reste un travail distinct pour l’artisan.',
  search: 'Client, téléphone ou code-barres de la commande…', selectAll: 'Sélectionner les commandes disponibles dans les résultats', clear: 'Désélectionner',
  selected: '{{orders}} commande(s) · {{pieces}} pièce(s) sélectionnée(s)', available: '{{count}} pièce(s) disponible(s)', limit: 'Vous pouvez sélectionner {{count}} commandes à la fois.',
  empty: 'Aucune commande ne correspond.', selectOrder: 'Sélectionner la commande de {{name}}', wage: 'Tarif par pièce pour cette commande', sfifaWage: 'Tarif par mètre pour cette commande',
  overrideHint: 'Facultatif ; le tarif par défaut est utilisé si ce champ est vide.', commonWageHint: 'Tarif par défaut des commandes sélectionnées. Vous pouvez le personnaliser dans chaque commande.',
  meters: 'Mètres de sfifa pour cette commande', commonMeters: 'Mètres par défaut par commande', metersHint: 'Vous pouvez préciser une longueur différente dans chaque commande.',
  sfifaHint: 'La largeur, la catégorie et le numéro de sfifa ci-dessous concernent les commandes sélectionnées. Les réalisations des clients ne sont pas ajoutées au stock.',
  linkOrders: 'Lier le travail aux commandes de confection', saved: 'Commande confiée', saving: 'Enregistrement de la commande…', uncertain: 'Enregistrement non confirmé. Réessayez pour confirmer la même demande sans la dupliquer.',
  partial: '{{count}} commandes confiées. Vérifiez les commandes restantes puis réessayez. Les commandes enregistrées ne seront pas dupliquées.',
  save: 'Confier les commandes sélectionnées', retry: 'Enregistrer les commandes restantes', chooseOrders: 'Sélectionnez entre 1 et 50 commandes.', done: '{{count}} commandes confiées à l’artisan.',
};
