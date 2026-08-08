موقع مركز كفرأبيل القرآني

طريقة التشغيل:
1) افتح index.html في المتصفح.
2) أبقِ مجلدي assets وdownloads بجانب ملفات HTML.
3) بعد التعديل، ارفع الملفات إلى GitHub حتى تظهر على الموقع المنشور.

الصفحات:
- index.html: الصفحة الرئيسية، الخبر، الإحصائيات، الكادر والتواصل.
- groups.html: مجموعات الذكور والإناث وملفات المجموعات المشتركة.
- group.html: القالب الموحد لتفاصيل كل مجموعة.
- tajweed.html: كادر ودورات التلاوة والتجويد.
- registration.html: روابط التسجيل الدائم والصيفي ودورات التجويد.
- exam-system.html: نظام الاختبارات والسحب الإلكتروني.

أماكن التعديل المهمة:
- صور السلايد: assets/images/slider
- قائمة صور السلايد: assets/js/main.js داخل sliderImages
- بيانات كل مجموعة وصورها: group.html داخل const groups
- بطاقات المجموعات: groups.html
- الملفات المشتركة: assets/resources ثم تعديل بطاقات قسم الموارد في groups.html
- وثيقة الترخيص: assets/documents/official-license.pdf
- شعار الجمعية: assets/brand/association-logo.png
- الهوية البصرية: assets/brand/association-identity.jpg
- آخر الأخبار: قسم news داخل index.html
- روابط التسجيل: registration.html

إضافة صور مجموعة:
1) ضع الصور داخل assets/images.
2) افتح group.html.
3) ابحث عن اسم المجموعة داخل const groups.
4) استبدل gallery:[null,null,null] بمسارات ثلاث صور، مثل:
   gallery:['assets/images/group-1.jpg','assets/images/group-2.jpg','assets/images/group-3.jpg']
