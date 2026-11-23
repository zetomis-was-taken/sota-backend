import 'dotenv/config';
import { and, eq, inArray, or } from 'drizzle-orm';
import { env } from '../src/config/env';
import { closeDb, db } from '../src/db';
import {
  cartItems,
  mediaAssets,
  museumAdmins,
  museums,
  shopOrderItems,
  souvenirProducts,
  userRoles,
  users,
} from '../src/db/schema';
import { deleteMedia, getSupabaseStorageClient } from '../src/lib/storage';
import { uuidSchema } from '../src/lib/validation';
import { SEED_MUSEUMS } from './seed-museums';

export interface SouvenirFixtureItem {
  sku: string;
  name: string;
  description: string;
  price: string; // Positive VND numeric(12, 2) format e.g. "250000.00"
  currency: 'VND'; // Strict VND currency compliance
  stockQuantity: number;
  imageUrl: string;
  imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  sourcePageUrl: string; // Authoritative provenance/file page to trace and verify asset rights
  mediaCredit: string;
  mediaRights: 'CC0' | 'Public Domain';
}

export interface MuseumSouvenirsDefinition {
  museumSlug: string;
  museumName: string;
  items: SouvenirFixtureItem[];
}

export interface ResolveProductSeedOptions {
  status?: 'draft' | 'published';
  createdBy?: string | null;
}

/**
 * Builds database-ready souvenir product payload with strict VND currency and default published status.
 */
export function buildProductSeedData(
  item: SouvenirFixtureItem,
  museumId: string,
  options?: ResolveProductSeedOptions
) {
  return {
    museumId,
    name: item.name,
    description: item.description,
    sku: item.sku,
    price: item.price,
    currency: item.currency, // Strictly 'VND'
    stockQuantity: item.stockQuantity,
    status: options?.status ?? 'published', // Default to published per Issue #14
    createdBy: options?.createdBy ?? null,
  };
}

export const SOUVENIR_FIXTURES: MuseumSouvenirsDefinition[] = [
  {
    "museumSlug": "national-museum-of-natural-history",
    "museumName": "National Museum of Natural History",
    "items": [
      {
        "sku": "NMNH-MIN-001",
        "name": "Mineral & Crystal Discovery Kit",
        "description": "Hộp khám phá 15 mẫu khoáng vật và tinh thể địa chất tự nhiên kèm kính lúp và cẩm nang nhận biết khoáng sản.",
        "price": "250000.00",
        "currency": "VND",
        "stockQuantity": 45,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/b/b3/Agate_de_l%27Esterel.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Agate_de_l%27Esterel.jpg",
        "mediaCredit": "Vassil",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMNH-DINO-001",
        "name": "Tyrannosaurus Rex Skeleton Scale Model",
        "description": "Mô hình lắp ráp giải phẫu bộ xương khủng long bạo chúa T-Rex tỉ lệ 1:30 đúc chi tiết từng khớp xương.",
        "price": "480000.00",
        "currency": "VND",
        "stockQuantity": 30,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/e/e2/Tyrannosaurus_Rex_skeleton_is_on_display_in_the_Dinosaurs_hall_at_the_Smithsonian%27s_National_Museum_of_Natural_History_in_Washington%2C_D.C..jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Tyrannosaurus_Rex_skeleton_is_on_display_in_the_Dinosaurs_hall_at_the_Smithsonian%27s_National_Museum_of_Natural_History_in_Washington,_D.C..jpg",
        "mediaCredit": "USDAgov",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMNH-FOS-001",
        "name": "Moroccan Trilobite Fossil Replica",
        "description": "Bản sao đúc tiêu bản hóa thạch bọ ba thùy kỷ Cambri cổ đại hoàn thiện màu đá tự nhiên.",
        "price": "180000.00",
        "currency": "VND",
        "stockQuantity": 50,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/5/5e/The_Quarterly_journal_of_the_Geological_Society_of_London_%2813205728875%29.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:The_Quarterly_journal_of_the_Geological_Society_of_London_(13205728875).jpg",
        "mediaCredit": "Geological Society of London",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMNH-BOOK-001",
        "name": "Prehistoric Life & Evolution Guidebook",
        "description": "Sách ảnh màu khổ lớn hướng dẫn tìm hiểu lịch sử sinh giới tiền sử và quá trình tiến hóa sự sống trên Trái Đất.",
        "price": "150000.00",
        "currency": "VND",
        "stockQuantity": 60,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/8/80/Talbotiella_velutina-NMNH-01106032.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Talbotiella_velutina-NMNH-01106032.jpg",
        "mediaCredit": "NMNH - Botany Dept.",
        "mediaRights": "CC0"
      },
      {
        "sku": "NMNH-GEM-001",
        "name": "Hope Diamond Commemorative Pendant",
        "description": "Mặt dây chuyền pha lê lam thẫm mô phỏng giác cắt viên kim cương huyền thoại Hope Diamond nổi tiếng tại bảo tàng.",
        "price": "320000.00",
        "currency": "VND",
        "stockQuantity": 40,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/2/2a/The_Hope_Diamond_-_SIA.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:The_Hope_Diamond_-_SIA.jpg",
        "mediaCredit": "Unknown authorUnknown author",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMNH-AMB-001",
        "name": "Baltic Amber with Insect Inclusion Replica",
        "description": "Tiêu bản mô phỏng khối hổ phách Baltic trong suốt lưu giữ mẫu muỗi cổ đại từ hàng triệu năm trước.",
        "price": "220000.00",
        "currency": "VND",
        "stockQuantity": 35,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/2/22/Amber.insect.800pix.050203.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Amber.insect.800pix.050203.jpg",
        "mediaCredit": "Adrian Pingstone",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMNH-MAM-001",
        "name": "Woolly Mammoth Plush Companion",
        "description": "Thú nhồi bông voi ma mút tiền sử Columbian kỷ băng hà với lớp lông xoăn mềm mại và cặp ngà cong sinh động.",
        "price": "190000.00",
        "currency": "VND",
        "stockQuantity": 55,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/0/0a/Woolly-mammoth-100k-4096-occlusion_%28Smithsonian_Institution%29.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Woolly-mammoth-100k-4096-occlusion_(Smithsonian_Institution).jpg",
        "mediaCredit": "Smithsonian Institution",
        "mediaRights": "CC0"
      }
    ]
  },
  {
    "museumSlug": "national-air-and-space-museum",
    "museumName": "National Air and Space Museum",
    "items": [
      {
        "sku": "NASM-APO-001",
        "name": "Apollo 11 Mission Embroidered Patch",
        "description": "Huy hiệu thêu vải chính thức của nhiệm vụ Apollo 11 lịch sử đưa con người đặt chân lên Mặt Trăng năm 1969.",
        "price": "85000.00",
        "currency": "VND",
        "stockQuantity": 80,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/f/f8/Apollo11logo.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Apollo11logo.jpg",
        "mediaCredit": "NASA",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NASM-SHU-001",
        "name": "Space Shuttle Discovery Scale Model",
        "description": "Mô hình hợp kim đúc tàu con thoi Discovery tỉ lệ 1:200 kèm giá đỡ trưng bày góc bay mô phỏng.",
        "price": "550000.00",
        "currency": "VND",
        "stockQuantity": 25,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/9/97/STS_114_day_before_launch.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:STS_114_day_before_launch.jpg",
        "mediaCredit": "User:FEXX, from NASA photo.",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NASM-ICE-001",
        "name": "Neapolitan Astronaut Freeze-Dried Ice Cream",
        "description": "Kem phi hành gia ba vị sấy thăng hoa công nghệ dinh dưỡng vũ trụ ăn liền không cần trữ lạnh.",
        "price": "95000.00",
        "currency": "VND",
        "stockQuantity": 75,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/3/35/ISSSpaceFoodOnATray.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:ISSSpaceFoodOnATray.jpg",
        "mediaCredit": "NASA",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NASM-JAC-001",
        "name": "NASA Aviator Flight Bomber Jacket",
        "description": "Áo khoác phi công không quân màu xanh hải quân đính bộ huy hiệu nhiệm vụ vũ trụ Apollo, Shuttle và Artemis.",
        "price": "980000.00",
        "currency": "VND",
        "stockQuantity": 20,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/1/16/S-IC_engines_and_Von_Braun.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:S-IC_engines_and_Von_Braun.jpg",
        "mediaCredit": "NASA",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NASM-ART-001",
        "name": "Artemis I Lunar Exploration Patch",
        "description": "Huy hiệu thêu chương trình thám hiểm vũ trụ Artemis tiến lên Mặt Trăng và hướng tới Sao Hỏa.",
        "price": "85000.00",
        "currency": "VND",
        "stockQuantity": 70,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/1/13/Apollo_17_The_Last_Moon_Shot_Edit1.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Apollo_17_The_Last_Moon_Shot_Edit1.jpg",
        "mediaCredit": "Unknown NASA employee, scanned by Kipp Teague",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NASM-CAP-001",
        "name": "Classic NASA Meatball Logo Embroidered Cap",
        "description": "Mũ lưỡi trai cotton xanh lam thêu biểu trưng quả cầu NASA Meatball cổ điển thời hoàng kim thám hiểm không gian.",
        "price": "220000.00",
        "currency": "VND",
        "stockQuantity": 50,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/c/c8/Saturn_V-Shuttle-Ares_I-Ares_V-Ares_IV-SLS_Block_1_comparison_%282019%29.png",
        "imageMimeType": "image/png",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Saturn_V-Shuttle-Ares_I-Ares_V-Ares_IV-SLS_Block_1_comparison_(2019).png",
        "mediaCredit": "Various, including NASA",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NASM-ROCK-001",
        "name": "Saturn V Rocket 1:400 Desk Model",
        "description": "Mô hình để bàn tên lửa đẩy khổng lồ Saturn V cao 28cm tái hiện chân thực các tầng đẩy đưa tàu Apollo lên quỹ đạo.",
        "price": "450000.00",
        "currency": "VND",
        "stockQuantity": 30,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/1/16/Apollo_11_Launch_-_GPN-2000-000630.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Apollo_11_Launch_-_GPN-2000-000630.jpg",
        "mediaCredit": "NASA",
        "mediaRights": "Public Domain"
      }
    ]
  },
  {
    "museumSlug": "national-museum-of-american-history",
    "museumName": "National Museum of American History",
    "items": [
      {
        "sku": "AME-COIN-001",
        "name": "Star-Spangled Banner Commemorative Coin",
        "description": "Kỷ niệm chương kim loại đúc nổi lá cờ lịch sử Star-Spangled Banner và trích đoạn bản hùng ca quốc kỳ Hoa Kỳ.",
        "price": "160000.00",
        "currency": "VND",
        "stockQuantity": 65,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/c/c5/Defence_of_Fort_M%27Henry_broadside.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Defence_of_Fort_M%27Henry_broadside.jpg",
        "mediaCredit": "Francis Scott Key",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "AME-POST-001",
        "name": "Vintage Americana Postcard Folio",
        "description": "Bộ 12 bưu thiếp in ảnh tư liệu lịch sử đời sống, kiến trúc và các phong trào văn hóa nước Mỹ đầu thế kỷ 20.",
        "price": "75000.00",
        "currency": "VND",
        "stockQuantity": 90,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/9/9c/FDR-NBC-Microphone.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:FDR-NBC-Microphone.jpg",
        "mediaCredit": "Daderot",
        "mediaRights": "CC0"
      },
      {
        "sku": "AME-WAT-001",
        "name": "Railroad Heritage Vintage Pocket Watch",
        "description": "Đồng hồ quả quýt bỏ túi mạ đồng phong cách đồng hồ hoa tiêu đường sắt liên bang thế kỷ 19.",
        "price": "650000.00",
        "currency": "VND",
        "stockQuantity": 25,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/5/5d/Watch_MET_DP-12603-063.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Watch_MET_DP-12603-063.jpg",
        "mediaCredit": "Creator:Jaques Collomb",
        "mediaRights": "CC0"
      },
      {
        "sku": "AME-SCR-001",
        "name": "US Constitution Parchment Scroll Replica",
        "description": "Bản sao giấy da in nguyên bản văn bản Hiến pháp Hợp chủng quốc Hoa Kỳ năm 1787 chất lượng trưng bày.",
        "price": "120000.00",
        "currency": "VND",
        "stockQuantity": 60,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/8/8f/United_States_Declaration_of_Independence.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:United_States_Declaration_of_Independence.jpg",
        "mediaCredit": "original: w:Second Continental Congress; reproduction: William Stone",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "AME-TRAIN-001",
        "name": "Jupiter Locomotive Cast Metal Model",
        "description": "Mô hình đúc tinh xảo đầu máy hơi nước Jupiter nối liền đường sắt xuyên lục địa Bắc Mỹ năm 1869.",
        "price": "380000.00",
        "currency": "VND",
        "stockQuantity": 35,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/1/12/S-3_D_Jupiter_engine_restored.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:S-3_D_Jupiter_engine_restored.jpg",
        "mediaCredit": "National Air and Space Museum",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "AME-PIN-001",
        "name": "Civil Rights March Commemorative Pin",
        "description": "Huy hiệu men kỷ niệm cuộc tuần hành lịch sử vì quyền bình đẳng dân sự tại Washington D.C.",
        "price": "65000.00",
        "currency": "VND",
        "stockQuantity": 85,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/9/95/National_Museum_of_American_History-_Kenneth_E._Behring_Center.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:National_Museum_of_American_History-_Kenneth_E._Behring_Center.jpg",
        "mediaCredit": "Kurt Kaiser",
        "mediaRights": "CC0"
      }
    ]
  },
  {
    "museumSlug": "national-portrait-gallery",
    "museumName": "National Portrait Gallery",
    "items": [
      {
        "sku": "NPG-BOOK-001",
        "name": "American Presidents Portrait Anthology",
        "description": "Ấn phẩm nghệ thuật khổ lớn tổng hợp các bức họa chân dung chính thức của các đời Tổng thống Hoa Kỳ.",
        "price": "280000.00",
        "currency": "VND",
        "stockQuantity": 40,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/a/a8/Thomas_Jefferson%2C_head-and-shoulders_portrait%2C_facing_right_LCCN97503644.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Thomas_Jefferson,_head-and-shoulders_portrait,_facing_right_LCCN97503644.jpg",
        "mediaCredit": "Saint-Mémin, Charles Balthazar Julien Fevret de, 1770-1852, artist",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NPG-PRT-001",
        "name": "George Washington Lansdowne Canvas Print",
        "description": "Tranh in canvas độ sắc nét cao bức chân dung toàn thân lịch sử của George Washington do danh họa Gilbert Stuart vẽ.",
        "price": "420000.00",
        "currency": "VND",
        "stockQuantity": 30,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/1/12/Gilbert_Stuart%2C_George_Washington_%28Lansdowne_portrait%2C_1796%29.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Gilbert_Stuart,_George_Washington_(Lansdowne_portrait,_1796).jpg",
        "mediaCredit": "Gilbert Stuart",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NPG-BMK-001",
        "name": "Presidents Metal Bookmark Set",
        "description": "Bộ 4 thẻ kẹp sách hợp kim mạ vàng chạm khắc chân dung Washington, Jefferson, Lincoln và Roosevelt.",
        "price": "90000.00",
        "currency": "VND",
        "stockQuantity": 75,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/e/ed/Thomas_Jefferson_-_by_Gilbert_Stuart_-_c_1821_-_Natl_Portrait_Gallery_Washington_DC.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Thomas_Jefferson_-_by_Gilbert_Stuart_-_c_1821_-_Natl_Portrait_Gallery_Washington_DC.jpg",
        "mediaCredit": "Gilbert Stuart",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NPG-POST-001",
        "name": "Presidential Portraits Postcard Collection",
        "description": "Hộp 10 bưu thiếp in các tác phẩm hội họa chân dung tiêu biểu đang được lưu giữ tại National Portrait Gallery.",
        "price": "85000.00",
        "currency": "VND",
        "stockQuantity": 80,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/3/39/John_Adams_-_by_Gilbert_Stuart_-_c_1821_-_Natl_Portrait_Gallery_Washington_DC.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:John_Adams_-_by_Gilbert_Stuart_-_c_1821_-_Natl_Portrait_Gallery_Washington_DC.jpg",
        "mediaCredit": "Gilbert Stuart",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NPG-TOTE-001",
        "name": "Frederick Douglass Portrait Canvas Tote",
        "description": "Túi tote canvas cao cấp in chân dung và câu nói nổi tiếng của nhà văn, nhà tranh đấu bãi nô Frederick Douglass.",
        "price": "190000.00",
        "currency": "VND",
        "stockQuantity": 55,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/3/30/Frederick_Douglass.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Frederick_Douglass.jpg",
        "mediaCredit": "Unknown authorUnknown author",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NPG-LINC-001",
        "name": "Abraham Lincoln 1865 Matted Print",
        "description": "Tranh in chân dung Tổng thống Abraham Lincoln bo viền bìa cứng sẵn sàng lồng khung kính nghệ thuật.",
        "price": "350000.00",
        "currency": "VND",
        "stockQuantity": 35,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/0/0f/Abraham_Lincoln%2C_Sunday%2C_November_8%2C_1863_LCCN2008680252.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Abraham_Lincoln,_Sunday,_November_8,_1863_LCCN2008680252.jpg",
        "mediaCredit": "Gardner, Alexander, 1821-1882, photographer",
        "mediaRights": "Public Domain"
      }
    ]
  },
  {
    "museumSlug": "hirshhorn-museum-and-sculpture-garden",
    "museumName": "Hirshhorn Museum and Sculpture Garden",
    "items": [
      {
        "sku": "HMSG-SCU-001",
        "name": "Modernist Abstract Sculpture Replica",
        "description": "Tượng điêu khắc để bàn chất liệu composite đúc khối uốn lượn lấy cảm hứng từ khu vườn điêu khắc Hirshhorn.",
        "price": "460000.00",
        "currency": "VND",
        "stockQuantity": 30,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/5/55/Auguste_Rodin_002.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Auguste_Rodin_002.jpg",
        "mediaCredit": "Gryffindor",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "HMSG-TOTE-001",
        "name": "Hirshhorn Exhibition Heavy Canvas Tote",
        "description": "Túi tote vải canvas dệt thô in họa tiết kiến trúc hình trụ tròn độc đáo của bảo tàng nghệ thuật Hirshhorn.",
        "price": "220000.00",
        "currency": "VND",
        "stockQuantity": 60,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/7/7a/Hirshhorn_Museum_Sculpture_Garden_2007.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Hirshhorn_Museum_Sculpture_Garden_2007.jpg",
        "mediaCredit": "Gryffindor This panoramic image was created with Autostitch (stitched images may differ from reality",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "HMSG-SKT-001",
        "name": "Minimalist Hardcover Artist Sketchbook",
        "description": "Sổ vẽ mỹ thuật bìa đen tối giản, giấy vẽ định lượng 200gsm không axit chuyên dụng cho than chì, mực và màu nước.",
        "price": "140000.00",
        "currency": "VND",
        "stockQuantity": 70,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/5/58/Filming_in_the_Sculpture_Garden.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Filming_in_the_Sculpture_Garden.jpg",
        "mediaCredit": "Eric Long",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "HMSG-PIN-001",
        "name": "Geometric Modern Art Hard Enamel Pin Set",
        "description": "Bộ 3 ghim cài áo men cứng cao cấp tạo hình các khối màu hình học cơ bản phong cách nghệ thuật De Stijl.",
        "price": "110000.00",
        "currency": "VND",
        "stockQuantity": 75,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/d/d6/Wassily_kandinsky.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Wassily_kandinsky.jpg",
        "mediaCredit": "未知上傳者",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "HMSG-PRISM-001",
        "name": "Optical Glass Kinetic Color Prism Cube",
        "description": "Khối thủy tinh quang học khúc xạ ánh sáng đa sắc phản chiếu sắc cầu vồng sinh động theo từng góc nhìn.",
        "price": "310000.00",
        "currency": "VND",
        "stockQuantity": 40,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/b/b0/Di_Suvero_sculpture_deinstallation.JPG",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Di_Suvero_sculpture_deinstallation.JPG",
        "mediaCredit": "Uncommon fritillary",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "HMSG-MOB-001",
        "name": "Calder-Inspired Kinetic Mobile Kit",
        "description": "Bộ treo thăng bằng động học kim loại nghệ thuật phỏng theo tác phẩm chuyển động không gian của Alexander Calder.",
        "price": "490000.00",
        "currency": "VND",
        "stockQuantity": 25,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/e/ec/Hirshhorn_Museum_DC_2007_027.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Hirshhorn_Museum_DC_2007_027.jpg",
        "mediaCredit": "Gryffindor",
        "mediaRights": "Public Domain"
      }
    ]
  },
  {
    "museumSlug": "national-museum-of-asian-art",
    "museumName": "National Museum of Asian Art",
    "items": [
      {
        "sku": "NMAA-TEA-001",
        "name": "Celadon Porcelain Teacup Set of Four",
        "description": "Bộ 4 tách thưởng trà gốm sứ men ngọc thanh thoát chạm họa tiết cánh sen thanh tao phong cách Đông Á cổ truyền.",
        "price": "820000.00",
        "currency": "VND",
        "stockQuantity": 25,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/2/28/Bottle%2C_Korea%2C_Goryeo_period%2C_1100s_AD%2C_stoneware%2C_black_and_white_slips_under_celadon_glaze_-_Freer_Gallery_of_Art_-_DSC04842.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Bottle,_Korea,_Goryeo_period,_1100s_AD,_stoneware,_black_and_white_slips_under_celadon_glaze_-_Freer_Gallery_of_Art_-_DSC04842.jpg",
        "mediaCredit": "Daderot",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMAA-SILK-001",
        "name": "Traditional Silk Scarf with Lotus Motifs",
        "description": "Khăn choàng lụa tơ tằm dệt thủ công mềm mại phối họa tiết hoa sen lấy cảm hứng từ tranh lụa cổ điển Á Đông.",
        "price": "520000.00",
        "currency": "VND",
        "stockQuantity": 35,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/6/68/Krishna_with_flute.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Krishna_with_flute.jpg",
        "mediaCredit": "Unknown authorUnknown author, author of the photo Freer Gallery of Art and Arthur M. Sackler Gallery",
        "mediaRights": "CC0"
      },
      {
        "sku": "NMAA-BRU-001",
        "name": "Calligraphy Four Treasures Writing Kit",
        "description": "Bộ văn phòng tứ bảo gồm 2 bút lông dê và sói, thỏi mực xạ, nghiên đá đoan khê và tập giấy xuyến chỉ tập viết.",
        "price": "360000.00",
        "currency": "VND",
        "stockQuantity": 45,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/4/48/The_Calligraphy_Model_Sunny_after_Snow_by_Wang_Xizhi.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:The_Calligraphy_Model_Sunny_after_Snow_by_Wang_Xizhi.jpg",
        "mediaCredit": "After Wang Xizhi",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMAA-FAN-001",
        "name": "Hokusai Great Wave Bamboo Folding Fan",
        "description": "Quạt nan tre truyền thống in kiệt tác tranh mộc bản Sóng lừng ngoài khơi Kanagawa của danh họa Hokusai.",
        "price": "130000.00",
        "currency": "VND",
        "stockQuantity": 85,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/0/0a/The_Great_Wave_off_Kanagawa.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:The_Great_Wave_off_Kanagawa.jpg",
        "mediaCredit": "After Katsushika Hokusai",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMAA-CARD-001",
        "name": "Ukiyo-e Woodblock Prints Boxed Notecards",
        "description": "Hộp 8 thiệp gấp cao cấp in các bức tranh phù thế mộc bản Ukiyo-e tiêu biểu của danh họa Hiroshige và Utamaro.",
        "price": "160000.00",
        "currency": "VND",
        "stockQuantity": 65,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/1/19/Ando_Hiroshige_-_Plum_Garden%2C_Kameido_-_Google_Art_Project.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:Ando_Hiroshige_-_Plum_Garden,_Kameido_-_Google_Art_Project.jpg",
        "mediaCredit": "Ando Hiroshige",
        "mediaRights": "Public Domain"
      },
      {
        "sku": "NMAA-CEL-001",
        "name": "Lotus Ceramic Aromatherapy Incense Burner",
        "description": "Lư đốt trầm hương gốm men xanh ngọc tạo hình đóa sen hé nở giúp thư thái tinh thần trong không gian trà đạo.",
        "price": "270000.00",
        "currency": "VND",
        "stockQuantity": 40,
        "imageUrl": "https://upload.wikimedia.org/wikipedia/commons/4/41/FS-FSA_A1992.01_-_Sergius_N._Ferris_Luboshez_Collection.jpg",
        "imageMimeType": "image/jpeg",
        "sourcePageUrl": "https://commons.wikimedia.org/wiki/File:FS-FSA_A1992.01_-_Sergius_N._Ferris_Luboshez_Collection.jpg",
        "mediaCredit": "Ferris Luboshez",
        "mediaRights": "CC0"
      }
    ]
  }
];

export const MANAGED_SKUS: ReadonlySet<string> = new Set(
  SOUVENIR_FIXTURES.flatMap((m) => m.items.map((i) => i.sku))
);

export function getManagedSkus(): string[] {
  return Array.from(MANAGED_SKUS);
}

export interface StoragePreflightResult {
  skipped: boolean;
  bucketName: string;
  isPublic?: boolean;
}

export interface FindOrCreateMuseumOptions {
  superadminId: string;
  newMuseumStatus?: 'draft' | 'published';
}

export interface MuseumRecordInfo {
  id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  isCreated: boolean;
}

/**
 * Validates Supabase Storage configuration environment variables.
 */
export function validateStorageConfig(): {
  supabaseUrl: string;
  supabaseSecretKey: string;
  souvenirMediaBucket: string;
} {
  if (!env.supabaseUrl || !env.supabaseSecretKey) {
    throw new Error(
      'Missing Supabase Storage configuration. Required: SUPABASE_URL and SUPABASE_SECRET_KEY.'
    );
  }
  return {
    supabaseUrl: env.supabaseUrl,
    supabaseSecretKey: env.supabaseSecretKey,
    souvenirMediaBucket: env.souvenirMediaBucket,
  };
}

/**
 * Preflight check ensuring the souvenir-media storage bucket exists and is public.
 */
export async function checkStorageBucketPreflight(
  bucketName: string,
  storageClient?: any
): Promise<{ ok: boolean; bucketName: string; isPublic: boolean }> {
  const client = storageClient ?? getSupabaseStorageClient();
  const { data: bucket, error } = await client.storage.getBucket(bucketName);

  if (error || !bucket) {
    throw new Error(
      `Bucket "${bucketName}" does not exist on Supabase Storage (${
        error?.message || 'Not found'
      }). Please create public bucket "${bucketName}" following TODO.md (line 97) before running seed.`
    );
  }

  if (!bucket.public) {
    throw new Error(
      `Bucket "${bucketName}" exists but is not public (public: false). Please update bucket "${bucketName}" configuration to Public (public: true) so the catalog can serve public media.`
    );
  }

  return { ok: true, bucketName, isPublic: bucket.public };
}

/**
 * Runs storage preflight check unless skipMedia option is active.
 */
export async function runStoragePreflight(
  options: { skipMedia?: boolean; bucketName?: string } = {},
  storageClient?: any
): Promise<StoragePreflightResult> {
  const bucketName = options.bucketName || env.souvenirMediaBucket;
  if (options.skipMedia) {
    return { skipped: true, bucketName };
  }
  const result = await checkStorageBucketPreflight(bucketName, storageClient);
  return {
    skipped: false,
    bucketName: result.bucketName,
    isPublic: result.isPublic,
  };
}

/**
 * Finds an existing museum by slug/name preserving its existing status,
 * or creates a new museum with default status 'published' and assigns the superadmin.
 */
export async function findOrCreateMuseum(
  def: {
    museumSlug?: string;
    slug?: string;
    museumName?: string;
    name?: string;
  },
  options: FindOrCreateMuseumOptions,
  dbClient: any = db
): Promise<MuseumRecordInfo> {
  const slug = def.museumSlug || def.slug;
  const name = def.museumName || def.name;

  if (!slug || !name) {
    throw new Error('Both museum slug and name must be provided');
  }

  const [existing] = await dbClient
    .select({
      id: museums.id,
      name: museums.name,
      slug: museums.slug,
      status: museums.status,
    })
    .from(museums)
    .where(or(eq(museums.slug, slug), eq(museums.name, name)))
    .limit(1);

  if (existing) {
    // Preserve existing museum status without silently changing it.
    // Ensure superadmin has active membership (reactivate if previously revoked).
    await dbClient
      .insert(museumAdmins)
      .values({
        museumId: existing.id,
        userId: options.superadminId,
        status: 'active',
        assignedBy: options.superadminId,
      })
      .onConflictDoUpdate({
        target: [museumAdmins.museumId, museumAdmins.userId],
        set: {
          status: 'active',
          revokedAt: null,
          assignedBy: options.superadminId,
        },
      });

    return {
      id: existing.id,
      name: existing.name,
      slug: existing.slug,
      status: existing.status,
      isCreated: false,
    };
  }

  const canonical = SEED_MUSEUMS.find((m) => m.slug === slug);
  const [created] = await dbClient
    .insert(museums)
    .values({
      name: canonical?.name ?? name,
      slug,
      description: canonical?.description ?? name,
      address: canonical?.address ?? '1000 Jefferson Dr SW',
      city: canonical?.city ?? 'Washington',
      status: options.newMuseumStatus ?? 'published',
      createdBy: options.superadminId,
    })
    .returning({
      id: museums.id,
      name: museums.name,
      slug: museums.slug,
      status: museums.status,
    });

  // Assign superadmin active membership for the new museum
  await dbClient
    .insert(museumAdmins)
    .values({
      museumId: created.id,
      userId: options.superadminId,
      status: 'active',
      assignedBy: options.superadminId,
    })
    .onConflictDoUpdate({
      target: [museumAdmins.museumId, museumAdmins.userId],
      set: {
        status: 'active',
        revokedAt: null,
        assignedBy: options.superadminId,
      },
    });

  return {
    id: created.id,
    name: created.name,
    slug: created.slug,
    status: created.status,
    isCreated: true,
  };
}

/**
 * Checks if a museum's draft or archived status hides published products from the Public Catalog API (404).
 */
export function checkCatalogVisibilityWarning(
  museum: { name: string; status: 'draft' | 'published' | 'archived' },
  productStatus: 'draft' | 'published' = 'published'
): string | null {
  if (
    (museum.status === 'draft' || museum.status === 'archived') &&
    productStatus === 'published'
  ) {
    return `[Warning] Museum "${museum.name}" is in "${museum.status}" status. Per API contract, published products will be hidden from the Public Catalog API (404) until the museum is transitioned to 'published'.`;
  }
  return null;
}

export interface SafeCleanEnvironmentOptions {
  nodeEnv?: string | null;
  databaseUrl?: string | null;
}

/**
 * Validates that --clean is running in an explicit development or test environment
 * and that the database URL points to an allowed local/test host (localhost, 127.0.0.1, ::1, 0.0.0.0, *.local, *.test).
 * Fails fast to prevent accidental data deletion on remote, staging, or production databases.
 */
export function assertSafeCleanEnvironment(
  options?: SafeCleanEnvironmentOptions
): void {
  const nodeEnv =
    options && 'nodeEnv' in options ? options.nodeEnv : process.env.NODE_ENV;

  if (!nodeEnv || (nodeEnv !== 'development' && nodeEnv !== 'test')) {
    throw new Error(
      `Refusing to clean database: NODE_ENV must be explicitly set to 'development' or 'test' (received: ${JSON.stringify(
        nodeEnv
      )}).`
    );
  }

  const rawUrl =
    options && 'databaseUrl' in options
      ? options.databaseUrl
      : (process.env.DATABASE_URL || env.databaseUrl);

  if (!rawUrl || !rawUrl.trim()) {
    throw new Error(
      'Refusing to clean database: DATABASE_URL is not configured.'
    );
  }

  let hostname: string;
  try {
    const parsed = new URL(rawUrl.trim());
    hostname = parsed.hostname.toLowerCase();
  } catch {
    throw new Error(
      'Refusing to clean database: Invalid DATABASE_URL format.'
    );
  }

  const normalizedHost = hostname.replace(/^\[|\]$/g, '');
  const isLocal =
    normalizedHost === 'localhost' ||
    normalizedHost === '127.0.0.1' ||
    normalizedHost === '::1' ||
    normalizedHost === '0.0.0.0' ||
    normalizedHost.endsWith('.local') ||
    normalizedHost.endsWith('.test');

  if (!isLocal) {
    throw new Error(
      `Refusing to clean database: DATABASE_URL host "${hostname}" is not in the local/test allowlist (localhost, 127.0.0.1, ::1, 0.0.0.0, *.local, *.test). Remote/production databases cannot be cleaned.`
    );
  }
}

export interface ForeignKeyCheckResult {
  hasReferences: boolean;
  cartCount: number;
  orderCount: number;
  referencedProductIds: string[];
}

/**
 * Pre-checks whether any target product IDs are referenced by cart_items or shop_order_items (which have onDelete: 'restrict').
 * If references are found, aborts immediately by throwing a detailed error before any partial changes can occur.
 */
export async function checkForeignKeyReferences(
  productIds: string[],
  dbClient: any = db
): Promise<ForeignKeyCheckResult> {
  if (productIds.length === 0) {
    return {
      hasReferences: false,
      cartCount: 0,
      orderCount: 0,
      referencedProductIds: [],
    };
  }

  const referencedInCarts = await dbClient
    .select({ productId: cartItems.productId })
    .from(cartItems)
    .where(inArray(cartItems.productId, productIds));

  const referencedInOrders = await dbClient
    .select({ productId: shopOrderItems.productId })
    .from(shopOrderItems)
    .where(inArray(shopOrderItems.productId, productIds));

  const uniqueReferencedIds = Array.from(
    new Set([
      ...referencedInCarts.map((r: { productId: string }) => r.productId),
      ...referencedInOrders.map((r: { productId: string }) => r.productId),
    ])
  );

  if (uniqueReferencedIds.length > 0) {
    throw new Error(
      `Cannot clean souvenirs: ${referencedInCarts.length} cart item(s) and ${referencedInOrders.length} order item(s) reference ${uniqueReferencedIds.length} managed product(s) (${uniqueReferencedIds.join(', ')}). Delete aborted to respect foreign key restrictions.`
    );
  }

  return {
    hasReferences: false,
    cartCount: referencedInCarts.length,
    orderCount: referencedInOrders.length,
    referencedProductIds: [],
  };
}

/**
 * Scoped, read-only foreign key pre-check: resolves existing target museums and verifies whether any
 * existing managed souvenir products are referenced by cart_items or shop_order_items.
 * Runs BEFORE any museum creation or admin membership writes to guarantee zero partial mutations.
 */
export async function precheckManagedSouvenirsForeignKeys(
  definitions: MuseumSouvenirsDefinition[],
  dbClient: any = db
): Promise<ForeignKeyCheckResult> {
  const targetSlugs = definitions.map((d) => d.museumSlug);
  const targetNames = definitions.map((d) => d.museumName);

  // 1. Read-only query for existing museums matching target slugs or names
  const existingMuseums = await dbClient
    .select({
      id: museums.id,
      slug: museums.slug,
      name: museums.name,
    })
    .from(museums)
    .where(
      or(
        inArray(museums.slug, targetSlugs),
        inArray(museums.name, targetNames)
      )
    );

  if (existingMuseums.length === 0) {
    return {
      hasReferences: false,
      cartCount: 0,
      orderCount: 0,
      referencedProductIds: [],
    };
  }

  // 2. Build scoped conditions matching each existing museum with its fixture SKUs
  const targetConditions = existingMuseums
    .map((museum: { id: string; slug: string; name: string }) => {
      const def = definitions.find(
        (d) => d.museumSlug === museum.slug || d.museumName === museum.name
      );
      const skus = def ? def.items.map((i) => i.sku) : [];
      return skus.length > 0
        ? and(
            eq(souvenirProducts.museumId, museum.id),
            inArray(souvenirProducts.sku, skus)
          )
        : null;
    })
    .filter((cond: any): cond is NonNullable<typeof cond> => cond !== null);

  if (targetConditions.length === 0) {
    return {
      hasReferences: false,
      cartCount: 0,
      orderCount: 0,
      referencedProductIds: [],
    };
  }

  const whereClause =
    targetConditions.length === 1
      ? targetConditions[0]
      : or(...targetConditions);

  // 3. Read-only query for existing managed products in those museums
  const existingProducts = await dbClient
    .select({ id: souvenirProducts.id })
    .from(souvenirProducts)
    .where(whereClause);

  if (existingProducts.length === 0) {
    return {
      hasReferences: false,
      cartCount: 0,
      orderCount: 0,
      referencedProductIds: [],
    };
  }

  const productIds = existingProducts.map((p: { id: string }) => p.id);

  // 4. Verify no cart_items or shop_order_items reference these products
  return checkForeignKeyReferences(productIds, dbClient);
}

export interface CleanExistingSouvenirsResult {
  deletedProductsCount: number;
  deletedMediaCount: number;
}

export interface CleanTargetMuseum {
  museumId: string;
  museumName?: string;
  managedSkus: string[];
}

export type CleanManagedSouvenirsResult = CleanExistingSouvenirsResult;

/**
 * Safely removes existing managed souvenirs across multiple museums in a single atomic transaction.
 * Scoped strictly to the target museums and their corresponding managed SKUs.
 * Pre-checks foreign keys (cart_items and shop_order_items) across all target products before touching DB.
 * Deletes DB rows in one transaction (media_assets then souvenir_products),
 * then cleans associated Supabase Storage objects best-effort after commit.
 */
export async function cleanAllManagedSouvenirs(
  targets: CleanTargetMuseum[],
  dbClient: any = db,
  deleteMediaFn: (bucket: string, path: string) => Promise<void> = deleteMedia
): Promise<CleanExistingSouvenirsResult> {
  const validTargets = targets.filter((t) => t.managedSkus.length > 0);
  if (validTargets.length === 0) {
    return { deletedProductsCount: 0, deletedMediaCount: 0 };
  }

  // 1. Construct scoped query condition matching each museum with its respective SKUs
  const targetConditions = validTargets.map((t) =>
    and(
      eq(souvenirProducts.museumId, t.museumId),
      inArray(souvenirProducts.sku, t.managedSkus)
    )
  );

  const whereClause =
    targetConditions.length === 1
      ? targetConditions[0]
      : or(...targetConditions);

  const existingProducts = await dbClient
    .select({
      id: souvenirProducts.id,
      sku: souvenirProducts.sku,
      museumId: souvenirProducts.museumId,
    })
    .from(souvenirProducts)
    .where(whereClause);

  if (existingProducts.length === 0) {
    return { deletedProductsCount: 0, deletedMediaCount: 0 };
  }

  const productIds = existingProducts.map(
    (p: { id: string; sku: string | null; museumId: string }) => p.id
  );

  // 2. Pre-check foreign key references across all target products before touching database
  await checkForeignKeyReferences(productIds, dbClient);

  // 3. Perform database deletion within a single transaction across all target museums
  let storagePathsToDelete: string[] = [];
  let deletedMediaCount = 0;
  let deletedProductsCount = 0;

  await dbClient.transaction(async (tx: any) => {
    // 3a. Retrieve storage paths of associated media assets
    const mediaRows = await tx
      .select({
        id: mediaAssets.id,
        storagePath: mediaAssets.storagePath,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.entityType, 'souvenir'),
          inArray(mediaAssets.entityId, productIds)
        )
      );

    storagePathsToDelete = mediaRows
      .map((m: { storagePath: string | null }) => m.storagePath)
      .filter((p: string | null): p is string => typeof p === 'string' && p.length > 0);

    // 3b. Delete all associated media assets
    if (mediaRows.length > 0) {
      await tx
        .delete(mediaAssets)
        .where(
          and(
            eq(mediaAssets.entityType, 'souvenir'),
            inArray(mediaAssets.entityId, productIds)
          )
        );
      deletedMediaCount = mediaRows.length;
    }

    // 3c. Delete all souvenir products
    await tx
      .delete(souvenirProducts)
      .where(inArray(souvenirProducts.id, productIds));

    deletedProductsCount = existingProducts.length;
  });

  // 4. Best-effort Supabase Storage object cleanup after successful DB transaction commit
  const bucketName = env.souvenirMediaBucket;
  for (const path of storagePathsToDelete) {
    try {
      await deleteMediaFn(bucketName, path);
    } catch (storageErr) {
      console.warn(
        `[seed:souvenirs] Warning: Failed to delete storage object "${path}" (best-effort):`,
        storageErr
      );
    }
  }

  return {
    deletedProductsCount,
    deletedMediaCount,
  };
}

/**
 * Safely removes existing managed souvenirs for a single museum.
 * Scoped strictly to managed SKUs. Delegates to cleanAllManagedSouvenirs.
 */
export async function cleanExistingManagedSouvenirs(
  museumId: string,
  managedSkus: string[],
  dbClient: any = db,
  deleteMediaFn: (bucket: string, path: string) => Promise<void> = deleteMedia
): Promise<CleanExistingSouvenirsResult> {
  return cleanAllManagedSouvenirs(
    [{ museumId, managedSkus }],
    dbClient,
    deleteMediaFn
  );
}

export interface SeedSouvenirsCliOptions {
  superadminId?: string;
  status?: 'draft' | 'published';
  clean?: boolean;
  skipMedia?: boolean;
}

export interface SeedSouvenirsConfig {
  superadminId: string;
  status: 'draft' | 'published';
  clean: boolean;
  skipMedia: boolean;
}

export interface SeedRunDependencies {
  dbClient?: any;
  storageClient?: any;
  deleteMediaFn?: (bucket: string, path: string) => Promise<void>;
  nodeEnv?: string | null;
  databaseUrl?: string | null;
}

export interface SeedRunResult {
  museums: MuseumRecordInfo[];
  warnings: string[];
  storagePreflight: StoragePreflightResult;
  cleanSummary?: {
    deletedProductsCount: number;
    deletedMediaCount: number;
  };
}

/**
 * Parses command-line arguments for seed-souvenirs.
 */
export function parseCliArgs(
  args: string[] = process.argv.slice(2)
): SeedSouvenirsCliOptions {
  const options: SeedSouvenirsCliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--superadmin' || arg === '--superadmin-id' || arg === '-s') {
      options.superadminId = args[++i]?.trim();
    } else if (arg.startsWith('--superadmin=')) {
      options.superadminId = arg.slice('--superadmin='.length).trim();
    } else if (arg.startsWith('--superadmin-id=')) {
      options.superadminId = arg.slice('--superadmin-id='.length).trim();
    } else if (arg === '--status') {
      const val = args[++i]?.trim();
      if (val === 'draft' || val === 'published') {
        options.status = val;
      } else {
        throw new Error(
          `Invalid status "${val}". Allowed values: 'draft' | 'published'.`
        );
      }
    } else if (arg.startsWith('--status=')) {
      const val = arg.slice('--status='.length).trim();
      if (val === 'draft' || val === 'published') {
        options.status = val;
      } else {
        throw new Error(
          `Invalid status "${val}". Allowed values: 'draft' | 'published'.`
        );
      }
    } else if (arg === '--skip-media') {
      options.skipMedia = true;
    } else if (arg === '--clean') {
      options.clean = true;
    } else if (!arg.startsWith('-') && !options.superadminId) {
      options.superadminId = arg.trim();
    }
  }

  return options;
}

/**
 * Validates configuration before database/network operations.
 */
export function validateSeedConfig(envConfig: {
  superadminId?: string | null;
  nodeEnv?: string | null;
  databaseUrl?: string | null;
  status?: 'draft' | 'published';
  clean?: boolean;
  skipMedia?: boolean;
}): SeedSouvenirsConfig {
  const nodeEnv = envConfig.nodeEnv?.trim() || 'development';
  if (nodeEnv === 'production') {
    throw new Error('Refusing to run seed script in production environment.');
  }

  const clean = Boolean(envConfig.clean);
  if (clean) {
    assertSafeCleanEnvironment({
      nodeEnv: envConfig.nodeEnv,
      databaseUrl: envConfig.databaseUrl,
    });
  }

  const rawSuperadminId = envConfig.superadminId?.trim();
  if (!rawSuperadminId) {
    throw new Error(
      'Superadmin ID is required. Pass it via flag: --superadmin <uuid> (or -s <uuid>, or as first argument).'
    );
  }

  const parseResult = uuidSchema.safeParse(rawSuperadminId);
  if (!parseResult.success) {
    throw new Error(
      `Superadmin ID must be a valid UUID. Received: "${rawSuperadminId}"`
    );
  }

  const status = envConfig.status === 'draft' ? 'draft' : 'published';

  return {
    superadminId: rawSuperadminId,
    status,
    clean,
    skipMedia: Boolean(envConfig.skipMedia),
  };
}

/**
 * Confirms superadmin exists in users table and verifies super_admin role.
 */
export async function verifySuperadminExists(
  superadminId: string,
  dbClient: any = db
): Promise<void> {
  const [user] = await dbClient
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, superadminId))
    .limit(1);

  if (!user) {
    throw new Error(
      `Superadmin user with ID "${superadminId}" was not found in database. Please run "npm run seed:superadmins" first or provide an existing user ID.`
    );
  }

  const [role] = await dbClient
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, superadminId),
        eq(userRoles.role, 'super_admin')
      )
    )
    .limit(1);

  if (!role) {
    console.warn(
      `Notice: User "${superadminId}" is in users table but does not have the 'super_admin' role in user_roles.`
    );
  }
}

/**
 * Executes the seed souvenirs orchestration pipeline.
 */
export async function run(
  config: SeedSouvenirsConfig,
  deps: SeedRunDependencies = {}
): Promise<SeedRunResult> {
  const dbClient = deps.dbClient ?? db;

  console.log(
    `[seed:souvenirs] Starting orchestration with status="${config.status}", skipMedia=${config.skipMedia}, clean=${config.clean}...`
  );

  // If clean requested, enforce safety environment guard and run read-only foreign key pre-check
  // BEFORE any museum creation or admin membership writes to guarantee zero partial changes.
  if (config.clean) {
    assertSafeCleanEnvironment({
      nodeEnv: deps.nodeEnv,
      databaseUrl: deps.databaseUrl,
    });
    console.log(
      '[seed:souvenirs] Safe clean environment verified (local/test host and explicit dev/test NODE_ENV).'
    );

    await precheckManagedSouvenirsForeignKeys(SOUVENIR_FIXTURES, dbClient);
  }

  // 1. Storage Preflight
  const storagePreflight = await runStoragePreflight(
    { skipMedia: config.skipMedia, bucketName: env.souvenirMediaBucket },
    deps.storageClient
  );

  if (storagePreflight.skipped) {
    console.log(
      '[seed:souvenirs] Storage preflight skipped (--skip-media is active).'
    );
  } else {
    console.log(
      `[seed:souvenirs] Storage preflight verified: bucket "${storagePreflight.bucketName}" exists and is public.`
    );
  }

  // 2. Discover/Create Museums & Check Visibility
  const processedMuseums: MuseumRecordInfo[] = [];
  const warnings: string[] = [];

  for (const def of SOUVENIR_FIXTURES) {
    const museum = await findOrCreateMuseum(
      def,
      {
        superadminId: config.superadminId,
        newMuseumStatus: 'published', // Always default newly created museums to 'published' independent of product status
      },
      dbClient
    );
    processedMuseums.push(museum);

    const warning = checkCatalogVisibilityWarning(museum, config.status);
    if (warning) {
      warnings.push(warning);
      console.warn(`[seed:souvenirs] ${warning}`);
    }
  }

  console.log(
    `[seed:souvenirs] Verified ${processedMuseums.length} target Smithsonian museums.`
  );

  // 3. If clean is enabled, execute scoped cleanup across all target museums in a single atomic transaction
  let cleanSummary:
    | { deletedProductsCount: number; deletedMediaCount: number }
    | undefined;
  if (config.clean) {
    const cleanTargets: CleanTargetMuseum[] = SOUVENIR_FIXTURES.map(
      (def, idx) => ({
        museumId: processedMuseums[idx].id,
        museumName: processedMuseums[idx].name,
        managedSkus: def.items.map((i) => i.sku),
      })
    );

    const cleanResult = await cleanAllManagedSouvenirs(
      cleanTargets,
      dbClient,
      deps.deleteMediaFn ?? deleteMedia
    );

    cleanSummary = {
      deletedProductsCount: cleanResult.deletedProductsCount,
      deletedMediaCount: cleanResult.deletedMediaCount,
    };

    console.log(
      `[seed:souvenirs] Clean summary: ${cleanResult.deletedProductsCount} products and ${cleanResult.deletedMediaCount} media assets deleted across all target museums in a single transaction.`
    );
  }

  return {
    museums: processedMuseums,
    warnings,
    storagePreflight,
    cleanSummary,
  };
}

export async function main() {
  const rawOptions = parseCliArgs();
  const config = validateSeedConfig({
    superadminId: rawOptions.superadminId,
    status: rawOptions.status,
    clean: rawOptions.clean,
    skipMedia: rawOptions.skipMedia,
    nodeEnv: process.env.NODE_ENV,
    databaseUrl: process.env.DATABASE_URL || env.databaseUrl,
  });

  try {
    await verifySuperadminExists(config.superadminId);
    await run(config, {
      nodeEnv: process.env.NODE_ENV,
      databaseUrl: process.env.DATABASE_URL || env.databaseUrl,
    });
  } finally {
    await closeDb();
  }
}

if (process.env.NODE_ENV !== 'test' && require.main === module) {
  main().catch((err) => {
    console.error('Fatal seed souvenirs error:', err);
    process.exit(1);
  });
}
