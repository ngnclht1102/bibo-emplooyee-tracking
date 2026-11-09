// "What's new" notes bundled with the app (ticket 145), keyed by app version then
// locale ("en" is the fallback). Shown once, the first launch after an update to a
// version listed here — works offline and in personal mode. Add an entry when
// cutting a release; versions without an entry show nothing.
export const WHATS_NEW: Record<string, Record<string, string[]>> = {
  "1.7.2": {
    en: [
      "Fix a member’s name, login or password on the Members screen, or remove them from the workspace",
      "See replies to your feedback — answers appear on the What’s new page, with a badge when one arrives",
      "Projects can be limited to the people who work on them, so your task list only shows yours",
      "A project’s rate now fills in only for people without their own rate, instead of overriding everyone",
      "Fixed the app failing to open when its saved data was damaged, locked or the disk was full",
    ],
    vi: [
      "Sửa tên, tên đăng nhập hoặc mật khẩu của nhân viên ngay ở trang Nhân viên, hoặc xoá khỏi nhóm làm việc",
      "Xem phản hồi cho góp ý của bạn — câu trả lời hiện ở trang Có gì mới, kèm dấu báo khi có tin",
      "Dự án có thể giới hạn cho những người thực sự tham gia, nên danh sách Công việc chỉ hiện phần của bạn",
      "Giá của dự án giờ chỉ áp dụng cho người chưa có giá riêng, thay vì ghi đè lên tất cả",
      "Sửa lỗi ứng dụng không mở được khi dữ liệu đã lưu bị hỏng, bị khóa hoặc ổ đĩa đầy",
    ],
    zh: [
      "可以在“成员”页面修改成员的名称、登录名或密码，也可以把成员从工作区移除",
      "可以查看我们对你反馈的回复——答复显示在“新功能”页面，有新回复时会有提示",
      "项目可以只限定给实际参与的人，这样“任务”列表只显示与你相关的项目",
      "项目费率现在只对没有自己费率的人生效，不再覆盖所有人",
      "修复了保存的数据损坏、被锁定或磁盘已满时应用无法启动的问题",
    ],
    ja: [
      "「メンバー」画面でメンバーの名前・ログイン名・パスワードを修正でき、ワークスペースから削除もできます",
      "フィードバックへの返信が読めます。「新機能」ページに表示され、届くとバッジでお知らせします",
      "プロジェクトを実際に関わる人だけに限定できます。「タスク」一覧には自分の分だけが表示されます",
      "プロジェクトの単価は、自分の単価がない人にのみ適用されます。全員を上書きしなくなりました",
      "保存データが壊れていたり、ロックされていたり、ディスクが満杯のときにアプリが起動しない問題を修正しました",
    ],
    id: [
      "Perbaiki nama, login, atau kata sandi anggota di halaman Anggota, atau keluarkan dia dari ruang kerja",
      "Lihat balasan atas masukan Anda — jawaban muncul di halaman Yang baru, dengan tanda saat ada balasan",
      "Proyek bisa dibatasi hanya untuk orang yang mengerjakannya, jadi daftar Tugas hanya menampilkan milik Anda",
      "Tarif proyek kini hanya berlaku bagi orang yang belum punya tarif sendiri, bukan menimpa semua orang",
      "Memperbaiki aplikasi yang gagal terbuka saat data tersimpan rusak, terkunci, atau disk penuh",
    ],
    fr: [
      "Corrigez le nom, l’identifiant ou le mot de passe d’un membre sur l’écran Membres, ou retirez-le",
      "Consultez les réponses à vos commentaires — elles apparaissent sur la page Nouveautés, avec un badge",
      "Un projet peut être limité aux personnes qui y travaillent : votre liste de Tâches n’affiche que les vôtres",
      "Le tarif d’un projet ne s’applique plus qu’aux personnes sans tarif propre, au lieu de tout le monde",
      "Correction de l’application qui ne s’ouvrait pas quand ses données étaient endommagées ou le disque plein",
    ],
    es: [
      "Corrige el nombre, el usuario o la contraseña de un miembro en la pantalla Miembros, o quítalo del espacio",
      "Consulta las respuestas a tus comentarios: aparecen en la página Novedades, con un aviso al llegar",
      "Un proyecto puede limitarse a quienes trabajan en él, así tu lista de Tareas solo muestra lo tuyo",
      "La tarifa de un proyecto ahora solo se aplica a quienes no tienen tarifa propia, en vez de a todos",
      "Corregido que la aplicación no abriera con los datos guardados dañados, bloqueados o el disco lleno",
    ],
  },
  "1.7.1": {
    en: [
      "Create a task without a project — pick “No project” in the new task window",
      "Fixed a project you just created not showing up on the Tasks screen",
    ],
    vi: [
      "Tạo công việc không cần dự án — chọn “Không có dự án” trong cửa sổ công việc mới",
      "Sửa lỗi dự án vừa tạo không hiện ở trang Công việc",
    ],
    zh: [
      "可以创建不属于任何项目的任务——在新建任务窗口选择“无项目”",
      "修复刚创建的项目不显示在“任务”页面的问题",
    ],
    ja: [
      "プロジェクトなしでタスクを作成できます。新規タスク画面で「プロジェクトなし」を選びます",
      "作成したばかりのプロジェクトがタスク画面に表示されない問題を修正しました",
    ],
    id: [
      "Buat tugas tanpa proyek — pilih “Tanpa proyek” di jendela tugas baru",
      "Memperbaiki proyek yang baru dibuat tidak muncul di halaman Tugas",
    ],
    fr: [
      "Créez une tâche sans projet — choisissez « Sans projet » dans la fenêtre de nouvelle tâche",
      "Correction d'un projet tout juste créé qui n'apparaissait pas sur l'écran Tâches",
    ],
    es: [
      "Crea una tarea sin proyecto: elige «Sin proyecto» en la ventana de nueva tarea",
      "Corregido que un proyecto recién creado no apareciera en la pantalla de Tareas",
    ],
  },
  "1.7.0": {
    en: [
      "Track time against tasks and projects, with a timer you can start and stop from the menu bar",
      "Send an invoice to your workspace for the hours you logged, and see all your invoices in the app",
      "BiBoTracking now starts when you log in — turn that off, or start it minimized, in Settings",
      "A new What's new page with past release notes, plus a Send feedback form to reach us from the app",
    ],
    vi: [
      "Ghi thời gian theo công việc và dự án, với bộ đếm bạn có thể bật/tắt ngay từ thanh menu",
      "Gửi hóa đơn cho nhóm làm việc theo số giờ bạn đã ghi, và xem lại mọi hóa đơn ngay trong ứng dụng",
      "BiBoTracking giờ tự chạy khi bạn đăng nhập — có thể tắt, hoặc cho chạy thu nhỏ, trong Cài đặt",
      "Trang Có gì mới xem lại ghi chú các bản phát hành, kèm biểu mẫu góp ý để liên hệ với chúng tôi",
    ],
    zh: [
      "按任务和项目记录工时，并可直接从菜单栏启动或停止计时器",
      "按已记录的工时向工作区提交发票，并在应用内查看全部发票",
      "BiBoTracking 现在会在你登录时自动启动，可在设置中关闭或改为最小化启动",
      "新增“更新内容”页面，可回看历次发布说明，并可通过反馈表单直接联系我们",
    ],
    ja: [
      "タスクとプロジェクト単位で時間を記録でき、タイマーはメニューバーから開始・停止できます",
      "記録した時間をワークスペースに請求書として送信し、過去の請求書もアプリ内で確認できます",
      "BiBoTracking がログイン時に自動起動します。設定でオフにしたり、最小化で起動したりできます",
      "過去のリリースノートを見られる「新機能」ページと、アプリから送れるフィードバックフォームを追加しました",
    ],
    id: [
      "Catat waktu per tugas dan proyek, dengan pengatur waktu yang bisa dimulai dan dihentikan dari bilah menu",
      "Kirim faktur ke ruang kerja Anda untuk jam yang sudah dicatat, dan lihat semua faktur di aplikasi",
      "BiBoTracking kini berjalan saat Anda masuk — matikan, atau jalankan diperkecil, di Pengaturan",
      "Halaman Apa yang baru berisi catatan rilis sebelumnya, plus formulir masukan untuk menghubungi kami",
    ],
    fr: [
      "Suivez votre temps par tâche et par projet, avec un minuteur que vous lancez et arrêtez depuis la barre des menus",
      "Envoyez une facture à votre espace de travail pour les heures saisies, et retrouvez toutes vos factures dans l'application",
      "BiBoTracking démarre maintenant à l'ouverture de votre session — désactivez-le, ou lancez-le réduit, dans les Réglages",
      "Une page Nouveautés regroupe les notes des versions précédentes, avec un formulaire d'avis pour nous écrire",
    ],
    es: [
      "Registra tu tiempo por tareas y proyectos, con un cronómetro que puedes iniciar y detener desde la barra de menús",
      "Envía una factura a tu espacio de trabajo por las horas registradas y consulta todas tus facturas en la app",
      "BiBoTracking ahora se inicia al iniciar sesión: puedes desactivarlo, o abrirlo minimizado, en Ajustes",
      "Una nueva página de Novedades con las notas de versiones anteriores y un formulario para enviarnos comentarios",
    ],
  },
  "1.6.0": {
    en: [
      "See reports and screenshots for everyone you track right in the desktop app — no web dashboard needed",
      "Fixed only the latest 60 screenshots being viewable — you can now browse them all",
      "Fixed the web dashboard appearing blank or broken in Firefox and with ad blockers on",
      "Fixed some admin screens showing placeholder values instead of real data",
    ],
    vi: [
      "Xem báo cáo và ảnh chụp màn hình của mọi người bạn theo dõi ngay trong ứng dụng — không cần mở bảng điều khiển web",
      "Sửa lỗi chỉ xem được 60 ảnh chụp gần nhất — giờ bạn có thể xem tất cả",
      "Sửa lỗi bảng điều khiển web bị trống hoặc vỡ bố cục trên Firefox và khi bật trình chặn quảng cáo",
      "Sửa lỗi một số màn hình quản trị hiển thị giá trị giữ chỗ thay vì dữ liệu thật",
    ],
    zh: [
      "直接在桌面应用中查看所有被跟踪成员的报告和截图，无需打开网页仪表板",
      "修复了只能查看最近 60 张截图的问题，现在可以浏览全部截图",
      "修复了网页仪表板在 Firefox 中或开启广告拦截时显示空白或布局错乱的问题",
      "修复了部分管理页面显示占位内容而非真实数据的问题",
    ],
    ja: [
      "追跡している全員のレポートとスクリーンショットを、Web ダッシュボードを開かずにデスクトップアプリで直接確認できます",
      "最新 60 枚のスクリーンショットしか表示できなかった問題を修正し、すべて閲覧できるようになりました",
      "Firefox や広告ブロッカー有効時に Web ダッシュボードが空白になる・レイアウトが崩れる問題を修正しました",
      "一部の管理画面で実データの代わりに仮の値が表示される問題を修正しました",
    ],
    id: [
      "Lihat laporan dan tangkapan layar semua orang yang Anda pantau langsung di aplikasi desktop — tanpa membuka dasbor web",
      "Memperbaiki hanya 60 tangkapan layar terbaru yang bisa dilihat — kini Anda bisa melihat semuanya",
      "Memperbaiki dasbor web yang kosong atau berantakan di Firefox dan saat pemblokir iklan aktif",
      "Memperbaiki beberapa layar admin yang menampilkan nilai sementara, bukan data sebenarnya",
    ],
    fr: [
      "Consultez les rapports et captures d'écran de toutes les personnes suivies directement dans l'application, sans ouvrir le tableau de bord web",
      "Correction : seules les 60 dernières captures étaient visibles — vous pouvez désormais toutes les parcourir",
      "Correction du tableau de bord web vide ou mal affiché sous Firefox et avec un bloqueur de publicités",
      "Correction de certains écrans d'administration affichant des valeurs fictives au lieu des vraies données",
    ],
    es: [
      "Consulta los informes y capturas de todas las personas que sigues directamente en la app de escritorio, sin abrir el panel web",
      "Corregido que solo se pudieran ver las últimas 60 capturas: ahora puedes verlas todas",
      "Corregido el panel web que aparecía en blanco o descolocado en Firefox y con bloqueadores de anuncios",
      "Corregidas algunas pantallas de administración que mostraban valores de ejemplo en lugar de datos reales",
    ],
  },
  "1.5.1": {
    en: [
      "Screenshot privacy mode: capture only the active window, and skip the apps you choose.",
      "Dashboard fixes and a new full-screen screenshot viewer.",
    ],
    vi: [
      "Chế độ riêng tư cho ảnh chụp: chỉ chụp cửa sổ đang dùng và bỏ qua các ứng dụng bạn chọn.",
      "Sửa lỗi bảng điều khiển và trình xem ảnh chụp toàn màn hình mới.",
    ],
    zh: [
      "截图隐私模式：只截取当前窗口，并跳过你选择的应用。",
      "仪表盘修复，以及全新的全屏截图查看器。",
    ],
    ja: [
      "スクリーンショットのプライバシーモード：アクティブなウィンドウのみを撮影し、選択したアプリはスキップします。",
      "ダッシュボードの修正と、新しい全画面スクリーンショットビューア。",
    ],
    id: [
      "Mode privasi tangkapan layar: hanya jendela aktif yang ditangkap, dan aplikasi pilihan Anda dilewati.",
      "Perbaikan dasbor dan penampil tangkapan layar layar penuh yang baru.",
    ],
    fr: [
      "Mode confidentialité des captures : seule la fenêtre active est capturée, et les applications choisies sont ignorées.",
      "Corrections du tableau de bord et nouvelle visionneuse de captures en plein écran.",
    ],
    es: [
      "Modo de privacidad de capturas: solo se captura la ventana activa y se omiten las aplicaciones que elijas.",
      "Correcciones del panel y un nuevo visor de capturas a pantalla completa.",
    ],
  },
};

export function whatsNewFor(version: string, locale: string): string[] | null {
  const entry = WHATS_NEW[version];
  if (!entry) return null;
  return entry[locale] ?? entry.en ?? null;
}
