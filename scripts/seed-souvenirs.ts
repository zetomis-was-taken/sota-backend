import 'dotenv/config';

export interface SouvenirFixtureItem {
  sku: string;
  name: string;
  description: string;
  price: string; // Positive VND numeric(12, 2) format e.g. "250000.00"
  stockQuantity: number;
  imageUrl: string;
  imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  mediaCredit: string;
  mediaRights: 'CC0' | 'Public Domain';
}

export interface MuseumSouvenirsDefinition {
  museumSlug: string;
  museumName: string;
  items: SouvenirFixtureItem[];
}

export const SOUVENIR_FIXTURES: MuseumSouvenirsDefinition[] = [
  {
    museumSlug: 'national-museum-of-natural-history',
    museumName: 'National Museum of Natural History',
    items: [
      {
        sku: 'NMNH-MIN-001',
        name: 'Mineral & Crystal Discovery Kit',
        description:
          'Hộp khám phá 15 mẫu khoáng vật và tinh thể địa chất tự nhiên kèm kính lúp và cẩm nang nhận biết khoáng sản.',
        price: '250000.00',
        stockQuantity: 45,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Mineral_specimens.jpg/640px-Mineral_specimens.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Institution / Wikimedia Commons (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NMNH-DINO-001',
        name: 'Tyrannosaurus Rex Skeleton Scale Model',
        description:
          'Mô hình lắp ráp giải phẫu bộ xương khủng long bạo chúa T-Rex tỉ lệ 1:30 đúc chi tiết từng khớp xương.',
        price: '480000.00',
        stockQuantity: 30,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Tyrannosaurus_rex_skeleton.jpg/640px-Tyrannosaurus_rex_skeleton.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Museum of Natural History / CC0',
        mediaRights: 'CC0',
      },
      {
        sku: 'NMNH-FOS-001',
        name: 'Moroccan Trilobite Fossil Replica',
        description:
          'Bản sao đúc tiêu bản hóa thạch bọ ba thùy kỷ Cambri cổ đại hoàn thiện màu đá tự nhiên.',
        price: '180000.00',
        stockQuantity: 50,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Trilobite_fossil_specimen.jpg/640px-Trilobite_fossil_specimen.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Open Access (CC0)',
        mediaRights: 'CC0',
      },
      {
        sku: 'NMNH-BOOK-001',
        name: 'Prehistoric Life & Evolution Guidebook',
        description:
          'Sách ảnh màu khổ lớn hướng dẫn tìm hiểu lịch sử sinh giới tiền sử và quá trình tiến hóa sự sống trên Trái Đất.',
        price: '150000.00',
        stockQuantity: 60,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Natural_history_specimens_collection.jpg/640px-Natural_history_specimens_collection.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Libraries and Archives / CC0',
        mediaRights: 'CC0',
      },
      {
        sku: 'NMNH-GEM-001',
        name: 'Hope Diamond Commemorative Pendant',
        description:
          'Mặt dây chuyền pha lê lam thẫm mô phỏng giác cắt viên kim cương huyền thoại Hope Diamond nổi tiếng tại bảo tàng.',
        price: '320000.00',
        stockQuantity: 40,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Hope_Diamond_Smithsonian.jpg/640px-Hope_Diamond_Smithsonian.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Institution Archives (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NMNH-AMB-001',
        name: 'Baltic Amber with Insect Inclusion Replica',
        description:
          'Tiêu bản mô phỏng khối hổ phách Baltic trong suốt lưu giữ mẫu muỗi cổ đại từ hàng triệu năm trước.',
        price: '220000.00',
        stockQuantity: 35,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Baltic_amber_specimen.jpg/640px-Baltic_amber_specimen.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Open Access (CC0)',
        mediaRights: 'CC0',
      },
      {
        sku: 'NMNH-MAM-001',
        name: 'Woolly Mammoth Plush Companion',
        description:
          'Thú nhồi bông voi ma mút tiền sử Columbian kỷ băng hà với lớp lông xoăn mềm mại và cặp ngà cong sinh động.',
        price: '190000.00',
        stockQuantity: 55,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Mammoth_skeleton_exhibit.jpg/640px-Mammoth_skeleton_exhibit.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Institution / CC0',
        mediaRights: 'CC0',
      },
    ],
  },
  {
    museumSlug: 'national-air-and-space-museum',
    museumName: 'National Air and Space Museum',
    items: [
      {
        sku: 'NASM-APO-001',
        name: 'Apollo 11 Mission Embroidered Patch',
        description:
          'Huy hiệu thêu vải chính thức của nhiệm vụ Apollo 11 lịch sử đưa con người đặt chân lên Mặt Trăng năm 1969.',
        price: '85000.00',
        stockQuantity: 80,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Apollo_11_insignia.png/320px-Apollo_11_insignia.png',
        imageMimeType: 'image/png',
        mediaCredit: 'NASA (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NASM-SHU-001',
        name: 'Space Shuttle Discovery Scale Model',
        description:
          'Mô hình hợp kim đúc tàu con thoi Discovery tỉ lệ 1:200 kèm giá đỡ trưng bày góc bay mô phỏng.',
        price: '550000.00',
        stockQuantity: 25,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Space_Shuttle_Discovery_flyback.jpg/640px-Space_Shuttle_Discovery_flyback.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'NASA / Kennedy Space Center (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NASM-ICE-001',
        name: 'Neapolitan Astronaut Freeze-Dried Ice Cream',
        description:
          'Kem phi hành gia ba vị sấy thăng hoa công nghệ dinh dưỡng vũ trụ ăn liền không cần trữ lạnh.',
        price: '95000.00',
        stockQuantity: 75,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Freeze_dried_astronaut_food.jpg/640px-Freeze_dried_astronaut_food.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'NASA Food Technology Facility (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NASM-JAC-001',
        name: 'NASA Aviator Flight Bomber Jacket',
        description:
          'Áo khoác phi công không quân màu xanh hải quân đính bộ huy hiệu nhiệm vụ vũ trụ Apollo, Shuttle và Artemis.',
        price: '980000.00',
        stockQuantity: 20,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/NASA_Worm_logo.svg/320px-NASA_Worm_logo.svg.png',
        imageMimeType: 'image/png',
        mediaCredit: 'NASA / Richard Danne & Bruce Blackburn (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NASM-ART-001',
        name: 'Artemis I Lunar Exploration Patch',
        description:
          'Huy hiệu thêu chương trình thám hiểm vũ trụ Artemis tiến lên Mặt Trăng và hướng tới Sao Hỏa.',
        price: '85000.00',
        stockQuantity: 70,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Artemis_program_patch.svg/320px-Artemis_program_patch.svg.png',
        imageMimeType: 'image/png',
        mediaCredit: 'NASA (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NASM-CAP-001',
        name: 'Classic NASA Meatball Logo Embroidered Cap',
        description:
          'Mũ lưỡi trai cotton xanh lam thêu biểu trưng quả cầu NASA Meatball cổ điển thời hoàng kim thám hiểm không gian.',
        price: '220000.00',
        stockQuantity: 50,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/NASA_logo.svg/320px-NASA_logo.svg.png',
        imageMimeType: 'image/png',
        mediaCredit: 'NASA / James Modarelli (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NASM-ROCK-001',
        name: 'Saturn V Rocket 1:400 Desk Model',
        description:
          'Mô hình để bàn tên lửa đẩy khổng lồ Saturn V cao 28cm tái hiện chân thực các tầng đẩy đưa tàu Apollo lên quỹ đạo.',
        price: '450000.00',
        stockQuantity: 30,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Apollo_11_Saturn_V_lifting_off.jpg/640px-Apollo_11_Saturn_V_lifting_off.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'NASA (Public Domain)',
        mediaRights: 'Public Domain',
      },
    ],
  },
  {
    museumSlug: 'national-museum-of-american-history',
    museumName: 'National Museum of American History',
    items: [
      {
        sku: 'AME-COIN-001',
        name: 'Star-Spangled Banner Commemorative Coin',
        description:
          'Kỷ niệm chương kim loại đúc nổi lá cờ lịch sử Star-Spangled Banner và trích đoạn bản hùng ca quốc kỳ Hoa Kỳ.',
        price: '160000.00',
        stockQuantity: 65,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/2/21/Star-Spangled_Banner_flag.jpg/640px-Star-Spangled_Banner_flag.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Museum of American History (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'AME-POST-001',
        name: 'Vintage Americana Postcard Folio',
        description:
          'Bộ 12 bưu thiếp in ảnh tư liệu lịch sử đời sống, kiến trúc và các phong trào văn hóa nước Mỹ đầu thế kỷ 20.',
        price: '75000.00',
        stockQuantity: 90,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Vintage_postcard_collection_americana.jpg/640px-Vintage_postcard_collection_americana.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Library of Congress / CC0',
        mediaRights: 'CC0',
      },
      {
        sku: 'AME-WAT-001',
        name: 'Railroad Heritage Vintage Pocket Watch',
        description:
          'Đồng hồ quả quýt bỏ túi mạ đồng phong cách đồng hồ hoa tiêu đường sắt liên bang thế kỷ 19.',
        price: '650000.00',
        stockQuantity: 25,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Antique_pocket_watch_movement.jpg/640px-Antique_pocket_watch_movement.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Institution Collections (CC0)',
        mediaRights: 'CC0',
      },
      {
        sku: 'AME-SCR-001',
        name: 'US Constitution Parchment Scroll Replica',
        description:
          'Bản sao giấy da in nguyên bản văn bản Hiến pháp Hợp chủng quốc Hoa Kỳ năm 1787 chất lượng trưng bày.',
        price: '120000.00',
        stockQuantity: 60,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6c/Constitution_of_the_United_States%2C_page_1.jpg/640px-Constitution_of_the_United_States%2C_page_1.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Archives and Records Administration (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'AME-TRAIN-001',
        name: 'Jupiter Locomotive Cast Metal Model',
        description:
          'Mô hình đúc tinh xảo đầu máy hơi nước Jupiter nối liền đường sắt xuyên lục địa Bắc Mỹ năm 1869.',
        price: '380000.00',
        stockQuantity: 35,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Jupiter_locomotive_replica.jpg/640px-Jupiter_locomotive_replica.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Park Service (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'AME-PIN-001',
        name: 'Civil Rights March Commemorative Pin',
        description:
          'Huy hiệu men kỷ niệm cuộc tuần hành lịch sử vì quyền bình đẳng dân sự tại Washington D.C.',
        price: '65000.00',
        stockQuantity: 85,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Civil_rights_march_washington_1963.jpg/640px-Civil_rights_march_washington_1963.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Archives / Rowland Scherman (Public Domain)',
        mediaRights: 'Public Domain',
      },
    ],
  },
  {
    museumSlug: 'national-portrait-gallery',
    museumName: 'National Portrait Gallery',
    items: [
      {
        sku: 'NPG-BOOK-001',
        name: 'American Presidents Portrait Anthology',
        description:
          'Ấn phẩm nghệ thuật khổ lớn tổng hợp các bức họa chân dung chính thức của các đời Tổng thống Hoa Kỳ.',
        price: '280000.00',
        stockQuantity: 40,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Gilbert_Stuart_Williamstown_Portrait_of_George_Washington.jpg/640px-Gilbert_Stuart_Williamstown_Portrait_of_George_Washington.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Portrait Gallery / Gilbert Stuart (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NPG-PRT-001',
        name: 'George Washington Lansdowne Canvas Print',
        description:
          'Tranh in canvas độ sắc nét cao bức chân dung toàn thân lịch sử của George Washington do danh họa Gilbert Stuart vẽ.',
        price: '420000.00',
        stockQuantity: 30,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Gilbert_Stuart_George_Washington_%28Lansdowne_portrait%29.jpg/640px-Gilbert_Stuart_George_Washington_%28Lansdowne_portrait%29.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian National Portrait Gallery (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NPG-BMK-001',
        name: 'Presidents Metal Bookmark Set',
        description:
          'Bộ 4 thẻ kẹp sách hợp kim mạ vàng chạm khắc chân dung Washington, Jefferson, Lincoln và Roosevelt.',
        price: '90000.00',
        stockQuantity: 75,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Abraham_Lincoln_November_1863.jpg/640px-Abraham_Lincoln_November_1863.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Alexander Gardner / Library of Congress (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NPG-POST-001',
        name: 'Presidential Portraits Postcard Collection',
        description:
          'Hộp 10 bưu thiếp in các tác phẩm hội họa chân dung tiêu biểu đang được lưu giữ tại National Portrait Gallery.',
        price: '85000.00',
        stockQuantity: 80,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/5/56/Thomas_Jefferson_by_Rembrandt_Peale_1800.jpg/640px-Thomas_Jefferson_by_Rembrandt_Peale_1800.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Rembrandt Peale / White House Historical Association (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NPG-TOTE-001',
        name: 'Frederick Douglass Portrait Canvas Tote',
        description:
          'Túi tote canvas cao cấp in chân dung và câu nói nổi tiếng của nhà văn, nhà tranh đấu bãi nô Frederick Douglass.',
        price: '190000.00',
        stockQuantity: 55,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Frederick_Douglass_c1860s.jpg/640px-Frederick_Douglass_c1860s.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Portrait Gallery / Samuel J. Miller (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NPG-LINC-001',
        name: 'Abraham Lincoln 1865 Matted Print',
        description:
          'Tranh in chân dung Tổng thống Abraham Lincoln bo viền bìa cứng sẵn sàng lồng khung kính nghệ thuật.',
        price: '350000.00',
        stockQuantity: 35,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Abraham_Lincoln_O-77_matte_collodion_print.jpg/640px-Abraham_Lincoln_O-77_matte_collodion_print.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Portrait Gallery (Public Domain)',
        mediaRights: 'Public Domain',
      },
    ],
  },
  {
    museumSlug: 'hirshhorn-museum-and-sculpture-garden',
    museumName: 'Hirshhorn Museum and Sculpture Garden',
    items: [
      {
        sku: 'HMSG-SCU-001',
        name: 'Modernist Abstract Sculpture Replica',
        description:
          'Tượng điêu khắc để bàn chất liệu composite đúc khối uốn lượn lấy cảm hứng từ khu vườn điêu khắc Hirshhorn.',
        price: '460000.00',
        stockQuantity: 30,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Hirshhorn_sculpture_garden_exhibit.jpg/640px-Hirshhorn_sculpture_garden_exhibit.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Institution / CC0',
        mediaRights: 'CC0',
      },
      {
        sku: 'HMSG-TOTE-001',
        name: 'Hirshhorn Exhibition Heavy Canvas Tote',
        description:
          'Túi tote vải canvas dệt thô in họa tiết kiến trúc hình trụ tròn độc đáo của bảo tàng nghệ thuật Hirshhorn.',
        price: '220000.00',
        stockQuantity: 60,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Hirshhorn_Museum_building_exterior.jpg/640px-Hirshhorn_Museum_building_exterior.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Institution / CC0',
        mediaRights: 'CC0',
      },
      {
        sku: 'HMSG-SKT-001',
        name: 'Minimalist Hardcover Artist Sketchbook',
        description:
          'Sổ vẽ mỹ thuật bìa đen tối giản, giấy vẽ định lượng 200gsm không axit chuyên dụng cho than chì, mực và màu nước.',
        price: '140000.00',
        stockQuantity: 70,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Artist_sketchbook_blank_pages.jpg/640px-Artist_sketchbook_blank_pages.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Wikimedia Commons (CC0)',
        mediaRights: 'CC0',
      },
      {
        sku: 'HMSG-PIN-001',
        name: 'Geometric Modern Art Hard Enamel Pin Set',
        description:
          'Bộ 3 ghim cài áo men cứng cao cấp tạo hình các khối màu hình học cơ bản phong cách nghệ thuật De Stijl.',
        price: '110000.00',
        stockQuantity: 75,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Piet_Mondriaan_composition_with_red_yellow_blue.jpg/640px-Piet_Mondriaan_composition_with_red_yellow_blue.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Piet Mondrian / Kunstmuseum Den Haag (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'HMSG-PRISM-001',
        name: 'Optical Glass Kinetic Color Prism Cube',
        description:
          'Khối thủy tinh quang học khúc xạ ánh sáng đa sắc phản chiếu sắc cầu vồng sinh động theo từng góc nhìn.',
        price: '310000.00',
        stockQuantity: 40,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Dispersive_prism_light_spectrum.jpg/640px-Dispersive_prism_light_spectrum.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Wikimedia Commons (CC0)',
        mediaRights: 'CC0',
      },
      {
        sku: 'HMSG-MOB-001',
        name: 'Calder-Inspired Kinetic Mobile Kit',
        description:
          'Bộ treo thăng bằng động học kim loại nghệ thuật phỏng theo tác phẩm chuyển động không gian của Alexander Calder.',
        price: '490000.00',
        stockQuantity: 25,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Kinetic_mobile_sculpture_modern_art.jpg/640px-Kinetic_mobile_sculpture_modern_art.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Smithsonian Open Access (CC0)',
        mediaRights: 'CC0',
      },
    ],
  },
  {
    museumSlug: 'national-museum-of-asian-art',
    museumName: 'National Museum of Asian Art',
    items: [
      {
        sku: 'NMAA-TEA-001',
        name: 'Celadon Porcelain Teacup Set of Four',
        description:
          'Bộ 4 tách thưởng trà gốm sứ men ngọc thanh thoát chạm họa tiết cánh sen thanh tao phong cách Đông Á cổ truyền.',
        price: '820000.00',
        stockQuantity: 25,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Song_dynasty_celadon_cup.jpg/640px-Song_dynasty_celadon_cup.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Freer Gallery of Art / National Museum of Asian Art (CC0)',
        mediaRights: 'CC0',
      },
      {
        sku: 'NMAA-SILK-001',
        name: 'Traditional Silk Scarf with Lotus Motifs',
        description:
          'Khăn lụa tơ tằm dệt thủ công mềm mại phối họa tiết hoa sen lấy cảm hứng từ tranh lụa cổ điển Á Đông.',
        price: '520000.00',
        stockQuantity: 35,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Lotus_flower_chinese_silk_painting.jpg/640px-Lotus_flower_chinese_silk_painting.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Arthur M. Sackler Gallery / CC0',
        mediaRights: 'CC0',
      },
      {
        sku: 'NMAA-BRU-001',
        name: 'Calligraphy Four Treasures Writing Kit',
        description:
          'Bộ văn phòng tứ bảo gồm 2 bút lông dê và sói, thỏi mực xạ, nghiên đá đoan khê và tập giấy xuyến chỉ tập viết.',
        price: '360000.00',
        stockQuantity: 45,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Four_Treasures_of_the_Study_brushes_ink.jpg/640px-Four_Treasures_of_the_Study_brushes_ink.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Museum of Asian Art (CC0)',
        mediaRights: 'CC0',
      },
      {
        sku: 'NMAA-FAN-001',
        name: 'Hokusai Great Wave Bamboo Folding Fan',
        description:
          'Quạt nan tre truyền thống in kiệt tác tranh mộc bản Sóng lừng ngoài khơi Kanagawa của danh họa Hokusai.',
        price: '130000.00',
        stockQuantity: 85,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Great_Wave_off_Kanagawa2.jpg/640px-Great_Wave_off_Kanagawa2.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Katsushika Hokusai / Met Museum / Open Access (CC0)',
        mediaRights: 'CC0',
      },
      {
        sku: 'NMAA-CARD-001',
        name: 'Ukiyo-e Woodblock Prints Boxed Notecards',
        description:
          'Hộp 8 thiệp gấp cao cấp in các bức tranh phù thế mộc bản Ukiyo-e tiêu biểu của danh họa Hiroshige và Utamaro.',
        price: '160000.00',
        stockQuantity: 65,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Hiroshige_Kameido_plum_garden.jpg/640px-Hiroshige_Kameido_plum_garden.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'Utagawa Hiroshige / Brooklyn Museum (Public Domain)',
        mediaRights: 'Public Domain',
      },
      {
        sku: 'NMAA-CEL-001',
        name: 'Lotus Ceramic Aromatherapy Incense Burner',
        description:
          'Lư đốt trầm hương gốm men xanh ngọc tạo hình đóa sen hé nở giúp thư thái tinh thần trong không gian trà đạo.',
        price: '270000.00',
        stockQuantity: 40,
        imageUrl:
          'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Chinese_ceramic_incense_burner_song_dynasty.jpg/640px-Chinese_ceramic_incense_burner_song_dynasty.jpg',
        imageMimeType: 'image/jpeg',
        mediaCredit: 'National Museum of Asian Art / Freer Gallery (CC0)',
        mediaRights: 'CC0',
      },
    ],
  },
];

/**
 * Unique set of all managed SKUs defined across the 6 Smithsonian museums.
 */
export const MANAGED_SKUS: ReadonlySet<string> = new Set(
  SOUVENIR_FIXTURES.flatMap((m) => m.items.map((i) => i.sku))
);

/**
 * Returns a clone of the managed SKUs set.
 */
export function getManagedSkus(): ReadonlySet<string> {
  return MANAGED_SKUS;
}
