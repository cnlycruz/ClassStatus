-- Reviewed one-time cleanup for legacy automatic-collector publications on
-- 2026-08-28. This migration is deliberately coupled to the approved
-- Production snapshot. Any drift aborts the transaction before mutation.

begin;

create temporary table cleanup_20260828_expected (
  record_id text primary key,
  lgu_id text not null,
  expected_revision bigint not null,
  expected_event_key text not null,
  expected_conflict_key text not null,
  disposition text not null,
  survivor_id text
) on commit drop;

insert into cleanup_20260828_expected (
  record_id, lgu_id, expected_revision, expected_event_key,
  expected_conflict_key, disposition, survivor_id
) values
  -- Reviewed all-day canonical survivors.
  ('tier3-98c7ebaa676e886302d1', 'caloocan', 8737, '1388f6bb983bbf5654c672e2f3cb4c3f40e6927d6bb35148c057c85de7524e5f', 'caloocan|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-ccd6dbf5bc21dac47848', 'las-pinas', 1205, '68dfda295fe758f720a18742647242229fbaaa78a8ca059dbc7214fd5cf73b32', 'las-pinas|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-83ce071e5e92045b5bfc', 'malabon', 8772, '141261bc1175d5e9172ee5e2e3cd30cd57624da9caa1328517734458efdece6c', 'malabon|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-1132c9a3eb74ca1992b0', 'mandaluyong', 8644, 'eea4b826be1b8f152597f3ca235d615a48f45040bcdb61b375304131d34708c3', 'mandaluyong|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-2fc9e7f58b4401994204', 'manila', 8771, '6b140521548e2406d368692fd5f361f58600de3b05c56ca3bc7835bda340e861', 'manila|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-70992747b5dfdce0ae8d', 'marikina', 1378, 'f5f1836326b9d6f45fb3c9984d6bb1fca468567ed95054bc3dc39ba6679dbcc0', 'marikina|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-09fc8a7b034e1d96cd44', 'muntinlupa', 8634, '30523d5b3cc070cb5d3e50fdce1ec510d5884d5ce1707069d95cdde1aab6d333', 'muntinlupa|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-a4c0b46b79d3946a19b3', 'navotas', 7382, '8aa52c74aba18d4b1710792d4cff68e535c4e4a3ee40f19ac2b73d5d6c0fefbd', 'navotas|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-e1c7fe8101b0ad288022', 'paranaque', 8700, 'e5da0712538948beaa1eed59b037f9a195dc696dd63cd00e7262e8b2bcd2ea9b', 'paranaque|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-4e2fb74e8bf4266f7f84', 'pasay', 8643, 'c3333fcaa440fa1e6155b1346436cf984c17bd4dfc4f55412cd24a14b70b4511', 'pasay|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-ac8d0df4366c6c4e8527', 'pasig', 705, '8f026474c95be87baa00aab1ef87655304624c175d6e644d3209eee8340cb081', 'pasig|lgu|2026-08-28|elementary,junior-high,preschool,senior-high|all|all-day', 'canonical', null),
  ('tier3-f0f7e63180b173b380df', 'pateros', 1201, '3ffe5faa9f16150d712cb816ddf552c34f310dd19cad5160322da135510229b6', 'pateros|lgu|2026-08-28|elementary,junior-high,preschool,senior-high|all|all-day', 'canonical', null),
  ('tier3-4a9934cc93f9a7247edc', 'quezon-city', 8463, 'b63f55c39d853e469043f1c0aa19df7a71ec152b791bf03ada65fe5a6cc4b07b', 'quezon-city|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-20aaae80d35241771047', 'san-juan', 8727, '32ff7f6b9d9cd6cc58bacee11c4599c963993e66979e4f1aa7f650b1e37956d4', 'san-juan|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-1597674c99d25d647a3e', 'taguig', 8640, '657bd031c1c75aaa31255df2ce926c142b1e00f793cc971a84a1cab83f55a2a6', 'taguig|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),
  ('tier3-61c3c41fabfc979a6104', 'valenzuela', 8725, 'fb7d197beb078213e05207315f74c7b8655dcb1489f9a8c193fbdb5bcb1ad710', 'valenzuela|lgu|2026-08-28|all-levels|all|all-day', 'canonical', null),

  -- Reviewed Palace afternoon survivors; the stored noon boundary is corrected below.
  ('tier3-38c64eb2ad2632b325ef', 'makati', 400, '1de940955b14ff00ab494810f65720c14bfb5cb85eb68cfc6bfcd8de2300cf60', 'makati|lgu|2026-08-28|all-levels|all|12:00-23:59', 'palace', null),
  ('tier3-e7588054b36a1880aef8', 'pasig', 399, '8e465f2685dd1b00c84ed81aae285d42be05f6cffc4c5e7f6028bd019e6faaf1', 'pasig|lgu|2026-08-28|all-levels|all|12:00-23:59', 'palace', null),
  ('tier3-19feec500c8ff152a1fc', 'pateros', 399, '600d0abbf5d3af33cb9594331082b63ad756889c934e6181d9de69259d812805', 'pateros|lgu|2026-08-28|all-levels|all|12:00-23:59', 'palace', null),

  -- False Agoo section expansion: one row was emitted for every NCR LGU.
  ('tier3-608260ab95581491b35f', 'caloocan', 830, 'dc7fdf74d7e105a4a4f5331feef4df7c1cd83519919c5bbb71084eed4f18266b', 'caloocan|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-ad9ed1d23631bd23ee7c', 'las-pinas', 830, '20cc77571f88bf755698e4dcd046136e272f4e795e8a7561d12286016a8d3029', 'las-pinas|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-4526c150a8a330c08c33', 'makati', 830, 'e1e36134cc19d82214c44ea45da09cfb3c644fe5fe4941578453a1db74e4b3d2', 'makati|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-061884ed3cd6c3098168', 'malabon', 830, '612d0c6166d2fd104bbbb768e586a3b3c6ccb9bb2be824809700c835d813de2e', 'malabon|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-720fa0962aeb203ae39f', 'mandaluyong', 830, '8b10e450711419e8a4f348da993427ebc8dcbbaffbc6c0d5efcf3ab130b86a55', 'mandaluyong|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-959e3ae823f7b91b4a21', 'manila', 830, '077ad900b16d6e6a083a9e0c747aa572cce9c3ae337d6be0b217db71b19cfaa3', 'manila|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-cf780efba98f470a342e', 'marikina', 830, 'c53a8f5cbef7096745021fbf2295405a9d9a2049d2e28c600f7be4580602011c', 'marikina|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-1506e2ad399a476e5796', 'muntinlupa', 830, 'e6caff174c3a39cdfe65ece5ab42dfe07dc1440148073d45370cce89aa579661', 'muntinlupa|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-a0980d9bf0202c168bf7', 'navotas', 830, '32150bd6a1aa4671ca46188bb86e2bfae03b8f2551d9b3a535fc3fcbdd94d25e', 'navotas|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-356aa043dd951e135714', 'paranaque', 830, 'ba0ac781cc0f6e317224c16e89cdc95e2f93a12303d9461890bc080913f1237c', 'paranaque|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-4acee01848f4f765de74', 'pasay', 830, '1b13a66b0d58e5602a6ad1aec8a11b574690903fb248772a488a4d0f43980c93', 'pasay|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-8172350d15e0393fbdce', 'pasig', 830, '4b28ee30812237dc589d68b3f2c94a6212fd1b33de656e3c0e9ede9f8223465d', 'pasig|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-652748b2bd3cf4ef4428', 'pateros', 830, '08b6e7a1ed77a1d068621289269980a85338bc5bb64a5a50ab32d0623d7ddfb8', 'pateros|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-21e30938ea230fad6c3c', 'quezon-city', 830, '492df7c43316b0d6d07d8dff13516d7871241297bdac13a8404d592f92ecb25f', 'quezon-city|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-a6fc417eefca680aa144', 'san-juan', 830, '13133fc9052e9821a335705a198741d955272c80819c5ab79e2b1ae9c821a50a', 'san-juan|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-44c86c81259470fd0400', 'taguig', 830, 'b763f18cdc503f0ca86e8494673c0a4a0ca5cce80a7c91347cd88c4c9dc2eec1', 'taguig|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),
  ('tier3-aa5d4aa9370b8ddbb2d2', 'valenzuela', 830, 'bfd44724c24b8e766d8b430dda7ed9617202917b5cf970bf6cc29efb51e43c0a', 'valenzuela|lgu|2026-08-28|preschool|all|all-day', 'false-geography', null),

  -- False Malolos section expansion.
  ('tier3-40b351d7530f205a8e32', 'makati', 6064, 'fcb5e58a2cc69d99ab759c9804a10a06c65b09049786e16e521c5414154c93ff', 'makati|lgu|2026-08-28|all-levels|all|all-day', 'false-geography', null),
  ('tier3-071c95b45a515f7306cd', 'pasig', 6063, 'd76807c70a274eb90f02178db4b241bf2cee9ff5128c267115d1a5aea3b1a799', 'pasig|lgu|2026-08-28|all-levels|all|all-day', 'false-geography', null),
  ('tier3-f922a3cef86b9b95c5e7', 'pateros', 6063, 'dc5725204aee443184b31d704d36e392686bdde0a23eac80e7544fc790779f94', 'pateros|lgu|2026-08-28|all-levels|all|all-day', 'false-geography', null),

  -- Valid GMA evidence donors that are merged into the reviewed canonical row.
  ('tier3-423d8fb2b8713efc36c7', 'marikina', 7391, '15aa4a03afdaff20c5bd6a32604ac11a7d8802b120d63e39f54a158218e42a85', 'marikina|lgu|2026-08-28|all-levels|all|all-day', 'evidence-merged', 'tier3-70992747b5dfdce0ae8d'),
  ('tier3-951b9037c9e02571d4c0', 'pateros', 1262, '5ba4812875b400d2ff9b479a0800a7790e330018c4008c9ab8e29925becf9492', 'pateros|lgu|2026-08-28|senior-high|all|all-day', 'evidence-merged', 'tier3-f0f7e63180b173b380df'),

  -- Redundant Palace rows for LGUs already covered by a valid all-day Full notice.
  ('tier3-86ff5a24d27e4b53522b', 'caloocan', 400, '30ce01a912ead8d4bfa7f6930c3c5d315323adacdbce3d5641cb381603705da1', 'caloocan|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-98c7ebaa676e886302d1'),
  ('tier3-adcf88a5917f8b8bbeab', 'las-pinas', 400, '570b559be1f4463c08ba3929c1195bb9a71d0ce04703a8262e4f3221acbea7a6', 'las-pinas|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-ccd6dbf5bc21dac47848'),
  ('tier3-f71830ea42a0a2ab670f', 'malabon', 400, '72abd71d0b890fe59a3e1b8c7b6bcfac06e9f1de2d8dbe894acea115107bf61c', 'malabon|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-83ce071e5e92045b5bfc'),
  ('tier3-c6fdb654424ff8b39e5a', 'mandaluyong', 399, 'a6212903f7efb6485c9a7a686d6ad7e786928eeafcb94591544d7e1ae46717ea', 'mandaluyong|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-1132c9a3eb74ca1992b0'),
  ('tier3-8e2fe371b0cec94dceb4', 'manila', 399, '1c01ea04999c77ba6bdbe2e1dbd6c8673da76fd8231ba640cf8e97809b9a20d7', 'manila|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-2fc9e7f58b4401994204'),
  ('tier3-a098e3505ed0a95625f3', 'marikina', 399, '91873f55fa1b655a8aa1e95279b451d6be9573746196d2a76bf785bfafad11f0', 'marikina|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-70992747b5dfdce0ae8d'),
  ('tier3-d8f27aebb10d35fcfd38', 'muntinlupa', 399, 'e45fa039e0d1b63928c435bffc25cc3dbee10ad4dddaa563bd9ddad78e8e0adb', 'muntinlupa|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-09fc8a7b034e1d96cd44'),
  ('tier3-9a9a4209dbdc16193172', 'navotas', 399, 'df15a8c54c9b114ca1f212bcaeb899163a362e2c765adf528169a024f9f386ae', 'navotas|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-a4c0b46b79d3946a19b3'),
  ('tier3-b06e438bc490659ddef5', 'paranaque', 399, 'a3591cbe10e99c1192d866247c6cca04ab5dd07a2ae1c2f7c5c9131a0631cd5b', 'paranaque|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-e1c7fe8101b0ad288022'),
  ('tier3-b7b329a110930360cf9f', 'pasay', 399, '7b8d43993e5648d5ac1d868421c42eaa81cee1d2be58678c0621136c05bf4e9e', 'pasay|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-4e2fb74e8bf4266f7f84'),
  ('tier3-a7c92a15b1133ef00dc0', 'quezon-city', 399, '1507b354b636b194c6a0885227fb8ac9543f1ae4637f115005a996d82388bb2d', 'quezon-city|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-4a9934cc93f9a7247edc'),
  ('tier3-eac4f6762da1c4859ceb', 'san-juan', 399, '0b257fcaba611ea268a3beb41ab160b92a1089d63124fa9a86cc92ba841282b7', 'san-juan|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-20aaae80d35241771047'),
  ('tier3-752bade3087a75b60173', 'taguig', 399, '25c312bb7cdbaa9a708c5279ae8fd4b530f39126fb0ec9691f3746f15a9eb02b', 'taguig|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-1597674c99d25d647a3e'),
  ('tier3-417002913bb5aa6ca613', 'valenzuela', 399, 'f5e8fc862f75bceb9454b01481f1b4728bbf0453cbf67124212c495224af5c2a', 'valenzuela|lgu|2026-08-28|all-levels|all|12:00-23:59', 'stale-duplicate', 'tier3-61c3c41fabfc979a6104'),

  -- Older same-window scope interpretations.
  ('tier3-0a0f4f33ae543c2fce2e', 'las-pinas', 6168, 'a281b6c959d13edba8e9dda54893d6410e333469f51c9c493dca3aef6f833d7c', 'las-pinas|lgu|2026-08-28|all-levels|all|all-day', 'stale-duplicate', 'tier3-ccd6dbf5bc21dac47848'),
  ('tier3-01ab8cae69e0b31a8f70', 'quezon-city', 176, 'ca2963a768f2f32de93fe2adc51ef10428c6d8fe656ab09fd01c406f0fbbf289', 'quezon-city|lgu|2026-08-28|elementary,junior-high,preschool,senior-high|all|all-day', 'stale-duplicate', 'tier3-4a9934cc93f9a7247edc');

create temporary table cleanup_20260828_canonical (
  record_id text primary key,
  lgu_id text not null,
  new_family_key text not null,
  new_event_key text not null,
  status text not null,
  affected_levels jsonb not null,
  school_sector text not null,
  confidence text not null,
  evidence_mode text not null,
  evidence_donor_id text,
  expected_primary_source_id text not null,
  expected_primary_organization text not null,
  expected_primary_url text not null,
  expected_primary_fingerprint text not null,
  expected_gma_source_id text,
  expected_gma_organization text,
  expected_gma_url text,
  expected_gma_fingerprint text
) on commit drop;

insert into cleanup_20260828_canonical values
  ('tier3-98c7ebaa676e886302d1', 'caloocan', 'v2f:d1821aa6ea95b816ff3cc03bccd1a62b4b29502fc954549d3efa89ff3b7cfca7', 'v2e:a9a7c96d40c85fc3574e3c16f9c48bc18e6fc0b216b958b4e0b0c487f42fedca', 'classes-suspended', '["all-levels"]', 'all', 'high', 'canonical-gma', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '6b4bc09ccc33f7bbe803adb110788b5a7a8a531a86a3857e8abd049f768cfa8f', 'gma-news-walang-pasok', 'GMA Network', 'https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/', '605b17df8b929678b08f0b374c6a7b9c867c0b26bf5f740c4c4bc58df2533a2e'),
  ('tier3-ccd6dbf5bc21dac47848', 'las-pinas', 'v2f:6a84713bbe64400e1cf6d70c1e559a19e36d4de25fa1aab76873216ee2c78f5c', 'v2e:6e024959b12eeaac6793110d744af26fbf5661c973c7593c4bc8bd10698886df', 'classes-suspended', '["all-levels"]', 'all', 'medium', 'rappler-only', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '3e9e132668d7b61564ecce28ed4cf9f358d221bb134e630bc48cb290f7ddbe65', null, null, null, null),
  ('tier3-83ce071e5e92045b5bfc', 'malabon', 'v2f:588eff2c1f34c4cd88600f17bf251631f0833250dce6e45141aa716a3c999a50', 'v2e:4d84d3b69af03385ea9b8da88cf4fed670532cce20cf86152a7161d8008f635b', 'classes-suspended', '["all-levels"]', 'all', 'high', 'canonical-gma', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '6cc994f5d540be60d24db048ebb6c002bc8d0ce9ec997330066d6023ef6136cd', 'gma-news-walang-pasok', 'GMA Network', 'https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/', '605b17df8b929678b08f0b374c6a7b9c867c0b26bf5f740c4c4bc58df2533a2e'),
  ('tier3-1132c9a3eb74ca1992b0', 'mandaluyong', 'v2f:2e6cffa2322e7ad23fb988e83b33081a85bc57b62b318dd3981ef4f120b18305', 'v2e:57f769349d6fa458c7c64f8fbf14cf1163b88c6bdae022259db70257e3d9ebfd', 'classes-suspended', '["all-levels"]', 'all', 'medium', 'rappler-only', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '1925765289bc75bf0ac86a9d92b280a7f1dde8d5590c50b8abc80bfb00e4d426', null, null, null, null),
  ('tier3-2fc9e7f58b4401994204', 'manila', 'v2f:d7f37faaefb32c09ceffc755820be34939d2e566e5c38993a360987bb76f5d0e', 'v2e:5999ca0658abd9dd3fc9aaa47c5392c73983c63032876d81a33f1f2a66112e80', 'classes-suspended', '["all-levels"]', 'all', 'high', 'canonical-gma', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '6cc994f5d540be60d24db048ebb6c002bc8d0ce9ec997330066d6023ef6136cd', 'gma-news-walang-pasok', 'GMA Network', 'https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/', '605b17df8b929678b08f0b374c6a7b9c867c0b26bf5f740c4c4bc58df2533a2e'),
  ('tier3-70992747b5dfdce0ae8d', 'marikina', 'v2f:46e1ed66ed88e1a817d377f85f1e40f560f3db115d0ea74d9ef03e66707bfadf', 'v2e:9a5a0d76b9b73b94acb9ce46af1b81bedd13d9b24d3b3d3584d8aaa343c31fe1', 'classes-suspended', '["all-levels"]', 'all', 'high', 'donor-gma', 'tier3-423d8fb2b8713efc36c7', 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '33f718b3e2d8d549b4e56bb8ac45909d6e641e3abdda8c2a5ae029168a1ecea3', 'gma-news-walang-pasok', 'GMA Network', 'https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/', '605b17df8b929678b08f0b374c6a7b9c867c0b26bf5f740c4c4bc58df2533a2e'),
  ('tier3-09fc8a7b034e1d96cd44', 'muntinlupa', 'v2f:dfad89e3966ff5da0931472b272a111ca8a21a106faf7540422dff9ad49801b5', 'v2e:b29085ad7ac15e5c140a942926b936490d641ba4da2831042764bf934039a789', 'classes-suspended', '["all-levels"]', 'all', 'medium', 'rappler-only', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '0dfb9cc31cd5ebfecb1dfe37e317a092ecd613bf5420cd7f38111ef95664d526', null, null, null, null),
  ('tier3-a4c0b46b79d3946a19b3', 'navotas', 'v2f:617ca47dfbbb407b178d87f2e70ab6683877dd700ed7e1868de9bc751d643f8a', 'v2e:d0e86a81505a183ea2566aaf845f44d5be5156cf64ea0cf95064161c9e420634', 'classes-suspended', '["all-levels"]', 'all', 'medium', 'rappler-only', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '1925765289bc75bf0ac86a9d92b280a7f1dde8d5590c50b8abc80bfb00e4d426', null, null, null, null),
  ('tier3-e1c7fe8101b0ad288022', 'paranaque', 'v2f:bd7c4e98983cfa8d961ec9beda29c9ac61d4b45242852b523377e720a486a54b', 'v2e:d6d68208d08789081147691df7e3c8c6511e737976bdc5ce196b1b6e10eaf73a', 'classes-suspended', '["all-levels"]', 'all', 'high', 'canonical-gma', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '0dfb9cc31cd5ebfecb1dfe37e317a092ecd613bf5420cd7f38111ef95664d526', 'gma-news-walang-pasok', 'GMA Network', 'https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/', '605b17df8b929678b08f0b374c6a7b9c867c0b26bf5f740c4c4bc58df2533a2e'),
  ('tier3-4e2fb74e8bf4266f7f84', 'pasay', 'v2f:be2b00a4f0a0ff20d919153775f00c5b10f5b6150d38b5e331216aa43e0269fd', 'v2e:cd0ebebbaaa743a6799209a277c69e801dd1fc12a1ec7eb17f1922d72fe468a4', 'classes-suspended', '["all-levels"]', 'all', 'medium', 'rappler-only', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '1925765289bc75bf0ac86a9d92b280a7f1dde8d5590c50b8abc80bfb00e4d426', null, null, null, null),
  ('tier3-ac8d0df4366c6c4e8527', 'pasig', 'v2f:0c212785d32af422f1abf90927380b1b5a6ae270cb4995a12de450e90de4a3cb', 'v2e:a0ab337308e2dc935d7d72376d6733a2e57d1879bf286a4475af89bd2013522a', 'partial-suspension', '["preschool","elementary","junior-high","senior-high"]', 'all', 'medium', 'rappler-only', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '445114e939991a6a5564366aa17da991945d4231567cd47ed3803a655a5c1d76', null, null, null, null),
  ('tier3-f0f7e63180b173b380df', 'pateros', 'v2f:a716bdbba538547c7224d110bcc8fc210d48dd320d506aa081b820ca11620806', 'v2e:8e6df3c5bcb99572dc384d25de16f3c181ff65460948ae33ba9dea61f7fd58e0', 'partial-suspension', '["preschool","elementary","junior-high","senior-high"]', 'all', 'high', 'donor-gma', 'tier3-951b9037c9e02571d4c0', 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '7f30e83f6045578a4e5b2b7c6d73f4c0f312400345e6e2e85a80a6e1b729aa42', 'gma-news-walang-pasok', 'GMA Network', 'https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/', '37e41e3266a80aa17f393f082f9dde5cab475e3f6289b08e291b39fd6c2a1846'),
  ('tier3-4a9934cc93f9a7247edc', 'quezon-city', 'v2f:b7b3b750d277612e720e97fdc41bfcbf0b6750a07d20f7c99dcf2f2e51debf8c', 'v2e:111c81a608452728547ab34fbf0b53407e907359ec70020f7d0b16135db7315c', 'classes-suspended', '["all-levels"]', 'all', 'medium', 'rappler-only', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '829ee8328ad8ae58c4276eb1311a05dc4e1d98eeb033fbbbefc4ce5e58b6b871', null, null, null, null),
  ('tier3-20aaae80d35241771047', 'san-juan', 'v2f:d806bbb4a8b401b448a90201d139fd3457df30250480f668967ba191118c3432', 'v2e:466c533136866400ef8a9bbc9fa528ace91df5cbdc4d6d585e3bdb9cf8a28f5d', 'classes-suspended', '["all-levels"]', 'all', 'high', 'canonical-gma', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', 'd0d1dfa493a9e79719af9e18b47ebf17c70c768010003551a053757b012646b7', 'gma-news-walang-pasok', 'GMA Network', 'https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/', '605b17df8b929678b08f0b374c6a7b9c867c0b26bf5f740c4c4bc58df2533a2e'),
  ('tier3-1597674c99d25d647a3e', 'taguig', 'v2f:49b01e66cfd4db68c8cc62a069c50ab13dc1cc64064222e5acf08693fac0cf3b', 'v2e:94ca48cea371634bfe0323357e22ab4c58cec0071db7011e5f7c8227d0ec3e40', 'classes-suspended', '["all-levels"]', 'all', 'medium', 'rappler-only', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', '1925765289bc75bf0ac86a9d92b280a7f1dde8d5590c50b8abc80bfb00e4d426', null, null, null, null),
  ('tier3-61c3c41fabfc979a6104', 'valenzuela', 'v2f:e74248e4bb7443902bee256fe59d048d17c879522182d5e5a63c392b95ec5e4b', 'v2e:e930ca287aea16ee1be7e4a461fd1f6be5760281d6d0fc34d37cd33d9724c344', 'classes-suspended', '["all-levels"]', 'all', 'high', 'canonical-gma', null, 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', 'd0d1dfa493a9e79719af9e18b47ebf17c70c768010003551a053757b012646b7', 'gma-news-walang-pasok', 'GMA Network', 'https://www.gmanetwork.com/news/serbisyopubliko/walangpasok/1000102/walang-pasok-class-suspensions-for-friday-august-28-2026/story/', '605b17df8b929678b08f0b374c6a7b9c867c0b26bf5f740c4c4bc58df2533a2e');

create temporary table cleanup_20260828_final_all_day (
  record_id text primary key,
  lgu_id text unique not null,
  status text not null,
  affected_levels jsonb not null,
  school_sector text not null
) on commit drop;

insert into cleanup_20260828_final_all_day values
  ('tier3-98c7ebaa676e886302d1', 'caloocan', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-ccd6dbf5bc21dac47848', 'las-pinas', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-7d2be29935738601a447', 'makati', 'partial-suspension', '["all-levels"]', 'public'),
  ('tier3-83ce071e5e92045b5bfc', 'malabon', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-1132c9a3eb74ca1992b0', 'mandaluyong', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-2fc9e7f58b4401994204', 'manila', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-70992747b5dfdce0ae8d', 'marikina', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-09fc8a7b034e1d96cd44', 'muntinlupa', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-a4c0b46b79d3946a19b3', 'navotas', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-e1c7fe8101b0ad288022', 'paranaque', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-4e2fb74e8bf4266f7f84', 'pasay', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-ac8d0df4366c6c4e8527', 'pasig', 'partial-suspension', '["preschool","elementary","junior-high","senior-high"]', 'all'),
  ('tier3-f0f7e63180b173b380df', 'pateros', 'partial-suspension', '["preschool","elementary","junior-high","senior-high"]', 'all'),
  ('tier3-4a9934cc93f9a7247edc', 'quezon-city', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-20aaae80d35241771047', 'san-juan', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-1597674c99d25d647a3e', 'taguig', 'classes-suspended', '["all-levels"]', 'all'),
  ('tier3-61c3c41fabfc979a6104', 'valenzuela', 'classes-suspended', '["all-levels"]', 'all');

create temporary table cleanup_20260828_final_palace (
  record_id text primary key,
  lgu_id text unique not null,
  family_key text not null,
  event_key text unique not null
) on commit drop;

insert into cleanup_20260828_final_palace values
  ('tier3-38c64eb2ad2632b325ef', 'makati', 'v2f:c0636a3014ddd360a8aefc159d15416cbb082903c4d5d7091d6222e15d007f22', 'v2e:6f6c67f7ed35f5e8349cef03906dafbdc2f29f0425f8c3d1559c5efc33647eda'),
  ('tier3-e7588054b36a1880aef8', 'pasig', 'v2f:0c212785d32af422f1abf90927380b1b5a6ae270cb4995a12de450e90de4a3cb', 'v2e:6b1f828e0d13b0ed034df6021d0a7818f4393925a86a2c0ad383740cff5355b0'),
  ('tier3-19feec500c8ff152a1fc', 'pateros', 'v2f:a716bdbba538547c7224d110bcc8fc210d48dd320d506aa081b820ca11620806', 'v2e:cdac6abe56ab9e3ad3f62fd9b68e87e03f19a1cd3b36f4a89a210d7a3d4809bb');

do $cleanup$
declare
  cleanup_timestamp timestamptz := pg_catalog.clock_timestamp();
  migration_id constant text := '20260828161129_cleanup_20260828_legacy_suspensions';
  expected_count integer;
  actual_count integer;
  changed_count integer;
  source_match_count integer;
  cron_count integer;
  inactive_cron_count integer;
  row_spec record;
  stored record;
  primary_source jsonb;
  gma_source jsonb;
  new_record jsonb;
  old_additional jsonb;
  removed_fingerprints jsonb;
  retire_reason text;
  rappler_template jsonb;
  makati_source jsonb;
begin
  -- Hold this lock through COMMIT. Collector lease acquisition writes this
  -- table, so SHARE mode prevents a collector from racing the cleanup.
  lock table public.classstatus_collector_leases in share mode;

  if exists (
    select 1
    from public.classstatus_collector_leases lease
    where lease.deployment_namespace = 'production'
      and lease.lease_expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception 'classstatus:cleanup-production-collector-lease-active';
  end if;

  -- Cleanup authority requires the one reviewed Production scheduler row to
  -- exist exactly once and to be explicitly inactive. This never changes it.
  select pg_catalog.count(*),
         pg_catalog.count(*) filter (where scheduled_job.active is false)
  into cron_count, inactive_cron_count
  from cron.job scheduled_job
  where scheduled_job.jobname = 'classstatus-production-collector-every-minute';
  if cron_count is distinct from 1 or inactive_cron_count is distinct from 1 then
    raise exception 'classstatus:cleanup-production-collector-cron-not-exactly-one-inactive';
  end if;

  select pg_catalog.count(*) into expected_count from cleanup_20260828_expected;
  if expected_count is distinct from 57 then
    raise exception 'classstatus:cleanup-invalid-reviewed-manifest-count';
  end if;

  select pg_catalog.count(*) into actual_count
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.provenance_type = 'automatic-collector'
    and suspension.administrative_state = 'active'
    and suspension.record ->> 'effectiveDate' = '2026-08-28';
  if actual_count is distinct from 57 then
    raise exception 'classstatus:cleanup-snapshot-count-drift';
  end if;

  if exists (
    select 1
    from public.classstatus_suspensions suspension
    full join cleanup_20260828_expected expected
      on expected.record_id = suspension.record_id
     and suspension.deployment_namespace = 'production'
    where (
      suspension.deployment_namespace = 'production'
      and suspension.provenance_type = 'automatic-collector'
      and suspension.administrative_state = 'active'
      and suspension.record ->> 'effectiveDate' = '2026-08-28'
      and expected.record_id is null
    ) or (
      expected.record_id is not null
      and (
        suspension.record_id is null
        or suspension.provenance_type is distinct from 'automatic-collector'
        or suspension.administrative_state is distinct from 'active'
        or suspension.revision is distinct from expected.expected_revision
        or suspension.event_key is distinct from expected.expected_event_key
        or suspension.conflict_key is distinct from expected.expected_conflict_key
        or pg_catalog.jsonb_typeof(suspension.record) is distinct from 'object'
        or pg_catalog.jsonb_typeof(suspension.record -> 'id') is distinct from 'string'
        or coalesce(suspension.record ->> 'id', '') = ''
        or suspension.record ->> 'id' is distinct from expected.record_id
        or pg_catalog.jsonb_typeof(suspension.record -> 'eventKey') is distinct from 'string'
        or suspension.record ->> 'eventKey' is distinct from expected.expected_event_key
        or pg_catalog.jsonb_typeof(suspension.record -> 'lguId') is distinct from 'string'
        or suspension.record ->> 'lguId' is distinct from expected.lgu_id
        or pg_catalog.jsonb_typeof(suspension.record -> 'effectiveDate') is distinct from 'string'
        or suspension.record ->> 'effectiveDate' is distinct from '2026-08-28'
        or suspension.record ? 'schoolId'
        or pg_catalog.jsonb_typeof(suspension.record -> 'collectorProvenance') is distinct from 'object'
        or pg_catalog.jsonb_typeof(suspension.record #> '{collectorProvenance,pipeline}') is distinct from 'string'
        or suspension.record #>> '{collectorProvenance,pipeline}' is distinct from 'tier3-media'
        or pg_catalog.jsonb_typeof(suspension.record -> 'parserOutcome') is distinct from 'string'
        or suspension.record ->> 'parserOutcome' is distinct from 'accepted:tier3-explicit-lgu-suspension'
        or pg_catalog.jsonb_typeof(suspension.record -> 'administrativeState') is distinct from 'string'
        or suspension.record ->> 'administrativeState' is distinct from 'active'
        or pg_catalog.jsonb_typeof(suspension.record -> 'revision') is distinct from 'number'
        or (suspension.record ->> 'revision')::bigint is distinct from expected.expected_revision
        or pg_catalog.jsonb_typeof(suspension.record -> 'status') is distinct from 'string'
        or coalesce(suspension.record ->> 'status', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record -> 'affectedLevels') is distinct from 'array'
        or pg_catalog.jsonb_array_length(suspension.record -> 'affectedLevels') = 0
        or pg_catalog.jsonb_typeof(suspension.record -> 'schoolSector') is distinct from 'string'
        or coalesce(suspension.record ->> 'schoolSector', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record -> 'isAllDay') is distinct from 'boolean'
        or pg_catalog.jsonb_typeof(suspension.record -> 'source') is distinct from 'object'
        or pg_catalog.jsonb_typeof(suspension.record -> 'additionalSources') is distinct from 'array'
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,id}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,id}', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,organization}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,organization}', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,url}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,url}', '') !~ '^https://'
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,evidenceFingerprint}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,evidenceFingerprint}', '') !~ '^[0-9a-f]{64}$'
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,evidenceExcerpt}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,evidenceExcerpt}', '') = ''
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(suspension.record -> 'additionalSources') source(value)
          where pg_catalog.jsonb_typeof(source.value) is distinct from 'object'
             or pg_catalog.jsonb_typeof(source.value -> 'id') is distinct from 'string'
             or coalesce(source.value ->> 'id', '') = ''
             or pg_catalog.jsonb_typeof(source.value -> 'organization') is distinct from 'string'
             or coalesce(source.value ->> 'organization', '') = ''
             or pg_catalog.jsonb_typeof(source.value -> 'url') is distinct from 'string'
             or coalesce(source.value ->> 'url', '') !~ '^https://'
             or pg_catalog.jsonb_typeof(source.value -> 'evidenceFingerprint') is distinct from 'string'
             or coalesce(source.value ->> 'evidenceFingerprint', '') !~ '^[0-9a-f]{64}$'
             or pg_catalog.jsonb_typeof(source.value -> 'evidenceExcerpt') is distinct from 'string'
             or coalesce(source.value ->> 'evidenceExcerpt', '') = ''
        )
        or (
          expected.disposition = 'palace'
          and (
            (suspension.record ->> 'isAllDay')::boolean is distinct from false
            or pg_catalog.jsonb_typeof(suspension.record -> 'startTime') is distinct from 'string'
            or suspension.record ->> 'startTime' is distinct from '12:00'
            or pg_catalog.jsonb_typeof(suspension.record -> 'endTime') is distinct from 'string'
            or suspension.record ->> 'endTime' is distinct from '23:59'
            or suspension.record ->> 'status' is distinct from 'partial-suspension'
            or suspension.record -> 'affectedLevels' is distinct from '["all-levels"]'::jsonb
            or suspension.record ->> 'schoolSector' is distinct from 'all'
          )
        )
      )
    )
  ) then
    raise exception 'classstatus:cleanup-reviewed-snapshot-drift';
  end if;

  -- The reviewed Makati record is a new canonical insert, never a conversion
  -- of one of the false GMA legacy rows.
  if exists (
    select 1 from public.classstatus_suspensions suspension
    where suspension.deployment_namespace = 'production'
      and (
        suspension.record_id = 'tier3-7d2be29935738601a447'
        or suspension.event_key = 'v2e:a5e57620f6c3b5dd944ce2f7faafb2696d93af82a0733e8357b85b39520102c9'
        or suspension.conflict_key = 'v2f:c0636a3014ddd360a8aefc159d15416cbb082903c4d5d7091d6222e15d007f22'
      )
  ) then
    raise exception 'classstatus:cleanup-makati-canonical-conflict';
  end if;

  -- Rewrite the 16 reviewed all-day survivors with canonical v2 identity and
  -- only current, legitimate organization citations.
  for row_spec in select * from cleanup_20260828_canonical order by lgu_id
  loop
    select suspension.* into strict stored
    from public.classstatus_suspensions suspension
    join cleanup_20260828_expected expected on expected.record_id = suspension.record_id
    where suspension.deployment_namespace = 'production'
      and suspension.record_id = row_spec.record_id
      and suspension.revision = expected.expected_revision
    for update;

    primary_source := stored.record -> 'source';
    if pg_catalog.jsonb_typeof(primary_source) is distinct from 'object'
       or primary_source ->> 'id' is distinct from row_spec.expected_primary_source_id
       or primary_source ->> 'organization' is distinct from row_spec.expected_primary_organization
       or primary_source ->> 'url' is distinct from row_spec.expected_primary_url
       or primary_source ->> 'evidenceFingerprint' is distinct from row_spec.expected_primary_fingerprint
       or coalesce(primary_source ->> 'evidenceFingerprint', '') !~ '^[0-9a-f]{64}$'
       or coalesce(primary_source ->> 'evidenceExcerpt', '') = '' then
      raise exception 'classstatus:cleanup-untrusted-canonical-primary:%', row_spec.record_id;
    end if;
    primary_source := primary_source || pg_catalog.jsonb_build_object(
      'verified', row_spec.confidence = 'high'
    );
    old_additional := coalesce(stored.record -> 'additionalSources', '[]'::jsonb);

    if row_spec.evidence_mode = 'canonical-gma' then
      select pg_catalog.count(*) into source_match_count
      from pg_catalog.jsonb_array_elements(old_additional) source(value)
      where source.value ->> 'id' is not distinct from row_spec.expected_gma_source_id
        and source.value ->> 'organization' is not distinct from row_spec.expected_gma_organization
        and source.value ->> 'url' is not distinct from row_spec.expected_gma_url
        and source.value ->> 'evidenceFingerprint' is not distinct from row_spec.expected_gma_fingerprint;
      if source_match_count is distinct from 1 then
        raise exception 'classstatus:cleanup-reviewed-gma-citation-count:%', row_spec.record_id;
      end if;
      select source.value into gma_source
      from pg_catalog.jsonb_array_elements(old_additional) source(value)
      where source.value ->> 'id' is not distinct from row_spec.expected_gma_source_id
        and source.value ->> 'organization' is not distinct from row_spec.expected_gma_organization
        and source.value ->> 'url' is not distinct from row_spec.expected_gma_url
        and source.value ->> 'evidenceFingerprint' is not distinct from row_spec.expected_gma_fingerprint;
    elsif row_spec.evidence_mode = 'donor-gma' then
      select donor.record -> 'source' into gma_source
      from public.classstatus_suspensions donor
      join cleanup_20260828_expected expected on expected.record_id = donor.record_id
      where donor.deployment_namespace = 'production'
        and donor.record_id = row_spec.evidence_donor_id
        and donor.revision = expected.expected_revision;
    else
      gma_source := null;
    end if;

    if row_spec.confidence = 'high' then
      if gma_source is null
         or pg_catalog.jsonb_typeof(gma_source) is distinct from 'object'
         or gma_source ->> 'id' is distinct from row_spec.expected_gma_source_id
         or gma_source ->> 'organization' is distinct from row_spec.expected_gma_organization
         or gma_source ->> 'url' is distinct from row_spec.expected_gma_url
         or gma_source ->> 'evidenceFingerprint' is distinct from row_spec.expected_gma_fingerprint
         or coalesce(gma_source ->> 'evidenceExcerpt', '') = ''
         or coalesce(gma_source ->> 'evidenceFingerprint', '') !~ '^[0-9a-f]{64}$'
         or pg_catalog.lower(coalesce(gma_source ->> 'evidenceExcerpt', '')) ~ '(agoo|malolos|bocaue|pulilan)' then
        raise exception 'classstatus:cleanup-untrusted-gma-corroboration:%', row_spec.record_id;
      end if;
      gma_source := gma_source || pg_catalog.jsonb_build_object('verified', true);
    elsif gma_source is not null then
      raise exception 'classstatus:cleanup-unreviewed-corroboration:%', row_spec.record_id;
    end if;

    select coalesce(pg_catalog.jsonb_agg(fingerprint), '[]'::jsonb)
    into removed_fingerprints
    from (
      select source.value ->> 'evidenceFingerprint' as fingerprint
      from pg_catalog.jsonb_array_elements(old_additional) source(value)
      where source.value ->> 'evidenceFingerprint' is not null
        and (
          gma_source is null
          or source.value ->> 'evidenceFingerprint' is distinct from gma_source ->> 'evidenceFingerprint'
        )
      order by source.value ->> 'evidenceFingerprint'
    ) removed;

    new_record := stored.record || pg_catalog.jsonb_build_object(
      'status', row_spec.status,
      'affectedLevels', row_spec.affected_levels,
      'schoolSector', row_spec.school_sector,
      'isAllDay', true,
      'eventKey', row_spec.new_event_key,
      'parserOutcome', 'accepted:tier3-lgu-suspension:v2',
      'source', primary_source,
      'additionalSources', case when gma_source is null then '[]'::jsonb else pg_catalog.jsonb_build_array(gma_source) end,
      'confidence', row_spec.confidence,
      'publicationProvenance', pg_catalog.jsonb_build_object(
        'type', 'automatic-collector',
        'publicLabel', 'Published from approved Tier 3 media evidence'
      ),
      'administrativeState', 'active',
      'revision', stored.revision + 1
    ) - 'startTime' - 'endTime' - 'endDate' - 'untilFurtherNotice'
      - 'removalRequestedAt' - 'undoDeadline' - 'removalFinalizedAt';

    if classstatus_private.notice_family_key('production', new_record) is distinct from row_spec.new_family_key
       or classstatus_private.notice_event_key('production', new_record) is distinct from row_spec.new_event_key then
      raise exception 'classstatus:cleanup-canonical-key-mismatch:%', row_spec.record_id;
    end if;

    update public.classstatus_suspensions suspension
    set record = new_record,
        event_key = row_spec.new_event_key,
        conflict_key = row_spec.new_family_key,
        revision = stored.revision + 1,
        updated_at = cleanup_timestamp,
        undo_deadline = null,
        removal_finalized_at = null
    where suspension.deployment_namespace = 'production'
      and suspension.record_id = row_spec.record_id
      and suspension.revision = stored.revision
      and suspension.event_key = stored.event_key
      and suspension.conflict_key = stored.conflict_key;
    get diagnostics changed_count = row_count;
    if changed_count is distinct from 1 then
      raise exception 'classstatus:cleanup-canonical-stale-write:%', row_spec.record_id;
    end if;

    insert into public.classstatus_audit_entries (
      deployment_namespace, action, outcome, record_id, target_summary,
      correlation_id, reason_code, effective_at
    ) values (
      'production', 'cleanup-canonical-rewrite', 'success', row_spec.record_id,
      pg_catalog.jsonb_build_object(
        'recordId', row_spec.record_id,
        'oldRevision', stored.revision,
        'newRevision', stored.revision + 1,
        'oldEventKey', stored.event_key,
        'newEventKey', row_spec.new_event_key,
        'oldConflictKey', stored.conflict_key,
        'newConflictKey', row_spec.new_family_key,
        'removedFalseCitationFingerprints', removed_fingerprints,
        'survivingCanonicalId', row_spec.record_id,
        'cleanupEffectiveDate', '2026-08-28',
        'cleanupMigrationIdentifier', migration_id
      )::text,
      migration_id, 'cleanup-canonical-rewrite', cleanup_timestamp
    );
  end loop;

  -- Correct the three reviewed Palace windows. They remain Partial because a
  -- 13:00 start is a genuine time restriction.
  for row_spec in
    select * from (values
      ('tier3-38c64eb2ad2632b325ef', 'v2f:c0636a3014ddd360a8aefc159d15416cbb082903c4d5d7091d6222e15d007f22', 'v2e:6f6c67f7ed35f5e8349cef03906dafbdc2f29f0425f8c3d1559c5efc33647eda', 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', 'a3462f30826f75ffa8b048a1d3298ecdb30c17a2337350d538aa22a3b3dac2e4'),
      ('tier3-e7588054b36a1880aef8', 'v2f:0c212785d32af422f1abf90927380b1b5a6ae270cb4995a12de450e90de4a3cb', 'v2e:6b1f828e0d13b0ed034df6021d0a7818f4393925a86a2c0ad383740cff5355b0', 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', 'a3462f30826f75ffa8b048a1d3298ecdb30c17a2337350d538aa22a3b3dac2e4'),
      ('tier3-19feec500c8ff152a1fc', 'v2f:a716bdbba538547c7224d110bcc8fc210d48dd320d506aa081b820ca11620806', 'v2e:cdac6abe56ab9e3ad3f62fd9b68e87e03f19a1cd3b36f4a89a210d7a3d4809bb', 'rappler-walang-pasok', 'Rappler Philippines', 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/', 'a3462f30826f75ffa8b048a1d3298ecdb30c17a2337350d538aa22a3b3dac2e4')
    ) palace(record_id, new_family_key, new_event_key, expected_source_id, expected_organization, expected_url, expected_fingerprint)
  loop
    select suspension.* into strict stored
    from public.classstatus_suspensions suspension
    join cleanup_20260828_expected expected on expected.record_id = suspension.record_id
    where suspension.deployment_namespace = 'production'
      and suspension.record_id = row_spec.record_id
      and suspension.revision = expected.expected_revision
    for update;

    primary_source := stored.record -> 'source';
    old_additional := coalesce(stored.record -> 'additionalSources', '[]'::jsonb);
    if pg_catalog.jsonb_typeof(primary_source) is distinct from 'object'
       or primary_source ->> 'id' is distinct from row_spec.expected_source_id
       or primary_source ->> 'organization' is distinct from row_spec.expected_organization
       or primary_source ->> 'url' is distinct from row_spec.expected_url
       or primary_source ->> 'evidenceFingerprint' is distinct from row_spec.expected_fingerprint
       or coalesce(primary_source ->> 'evidenceExcerpt', '') = ''
       or pg_catalog.strpos(
         pg_catalog.lower(coalesce(primary_source ->> 'evidenceExcerpt', '')), 'starting 1 pm'
       ) = 0
       or coalesce(primary_source ->> 'evidenceFingerprint', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'classstatus:cleanup-untrusted-palace-primary:%', row_spec.record_id;
    end if;
    primary_source := primary_source || pg_catalog.jsonb_build_object('verified', false);
    select coalesce(pg_catalog.jsonb_agg(fingerprint), '[]'::jsonb)
    into removed_fingerprints
    from (
      select source.value ->> 'evidenceFingerprint' as fingerprint
      from pg_catalog.jsonb_array_elements(old_additional) source(value)
      where source.value ->> 'evidenceFingerprint' is not null
      order by source.value ->> 'evidenceFingerprint'
    ) removed;

    new_record := stored.record || pg_catalog.jsonb_build_object(
      'status', 'partial-suspension',
      'affectedLevels', pg_catalog.jsonb_build_array('all-levels'),
      'schoolSector', 'all',
      'isAllDay', false,
      'startTime', '13:00',
      'endTime', '23:59',
      'eventKey', row_spec.new_event_key,
      'parserOutcome', 'accepted:tier3-lgu-suspension:v2',
      'source', primary_source,
      'additionalSources', '[]'::jsonb,
      'confidence', 'medium',
      'publicationProvenance', pg_catalog.jsonb_build_object(
        'type', 'automatic-collector',
        'publicLabel', 'Published from approved Tier 3 media evidence'
      ),
      'administrativeState', 'active',
      'revision', stored.revision + 1
    ) - 'endDate' - 'untilFurtherNotice'
      - 'removalRequestedAt' - 'undoDeadline' - 'removalFinalizedAt';

    if classstatus_private.notice_family_key('production', new_record) is distinct from row_spec.new_family_key
       or classstatus_private.notice_event_key('production', new_record) is distinct from row_spec.new_event_key then
      raise exception 'classstatus:cleanup-palace-key-mismatch:%', row_spec.record_id;
    end if;

    update public.classstatus_suspensions suspension
    set record = new_record,
        event_key = row_spec.new_event_key,
        conflict_key = row_spec.new_family_key,
        revision = stored.revision + 1,
        updated_at = cleanup_timestamp,
        undo_deadline = null,
        removal_finalized_at = null
    where suspension.deployment_namespace = 'production'
      and suspension.record_id = row_spec.record_id
      and suspension.revision = stored.revision
      and suspension.event_key = stored.event_key
      and suspension.conflict_key = stored.conflict_key;
    get diagnostics changed_count = row_count;
    if changed_count is distinct from 1 then
      raise exception 'classstatus:cleanup-palace-stale-write:%', row_spec.record_id;
    end if;

    insert into public.classstatus_audit_entries (
      deployment_namespace, action, outcome, record_id, target_summary,
      correlation_id, reason_code, effective_at
    ) values (
      'production', 'cleanup-palace-time-correction', 'success', row_spec.record_id,
      pg_catalog.jsonb_build_object(
        'recordId', row_spec.record_id,
        'oldRevision', stored.revision,
        'newRevision', stored.revision + 1,
        'oldEventKey', stored.event_key,
        'newEventKey', row_spec.new_event_key,
        'oldConflictKey', stored.conflict_key,
        'newConflictKey', row_spec.new_family_key,
        'removedFalseCitationFingerprints', removed_fingerprints,
        'survivingCanonicalId', row_spec.record_id,
        'cleanupEffectiveDate', '2026-08-28',
        'cleanupMigrationIdentifier', migration_id
      )::text,
      migration_id, 'cleanup-palace-time-correction', cleanup_timestamp
    );
  end loop;

  -- Create the reviewed Rappler-backed Makati all-day canonical. The source
  -- metadata is copied from the same reviewed Rappler article, while the
  -- evidence excerpt is replaced with the exact approved Makati statement.
  select suspension.record -> 'source' into strict rappler_template
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.record_id = 'tier3-98c7ebaa676e886302d1';
  if pg_catalog.jsonb_typeof(rappler_template) is distinct from 'object'
     or rappler_template ->> 'id' is distinct from 'rappler-walang-pasok'
     or rappler_template ->> 'organization' is distinct from 'Rappler Philippines'
     or rappler_template ->> 'url' is distinct from 'https://www.rappler.com/philippines/class-suspensions-walang-pasok-august-28-2026/'
     or rappler_template ->> 'evidenceFingerprint' is distinct from '6b4bc09ccc33f7bbe803adb110788b5a7a8a531a86a3857e8abd049f768cfa8f'
     or pg_catalog.jsonb_typeof(rappler_template -> 'publishedAt') is distinct from 'string'
     or coalesce(rappler_template ->> 'publishedAt', '') = '' then
    raise exception 'classstatus:cleanup-untrusted-makati-rappler-template';
  end if;
  makati_source := rappler_template || pg_catalog.jsonb_build_object(
    'verified', false,
    'evidenceExcerpt', 'Makati City – face-to-face classes in all levels (public).'
  );

  new_record := pg_catalog.jsonb_build_object(
    'id', 'tier3-7d2be29935738601a447',
    'lguId', 'makati',
    'status', 'partial-suspension',
    'affectedLevels', pg_catalog.jsonb_build_array('all-levels'),
    'schoolSector', 'public',
    'effectiveDate', '2026-08-28',
    'isAllDay', true,
    'reason', 'Class suspension announcement',
    'announcementSummary', 'Makati City suspended face-to-face classes in all levels for public schools.',
    'source', makati_source,
    'additionalSources', '[]'::jsonb,
    'confidence', 'medium',
    'discoveredAt', cleanup_timestamp,
    'publishedAt', makati_source ->> 'publishedAt',
    'lifecycleState', 'expired',
    'isUpcoming', false,
    'isActive', false,
    'isExpired', true,
    'isDemo', false,
    'eventKey', 'v2e:a5e57620f6c3b5dd944ce2f7faafb2696d93af82a0733e8357b85b39520102c9',
    'parserOutcome', 'accepted:tier3-lgu-suspension:v2',
    'collectorProvenance', pg_catalog.jsonb_build_object(
      'pipeline', 'tier3-media',
      'runId', 'cleanup-20260828-reviewed-manifest',
      'collectedAt', cleanup_timestamp
    ),
    'publicationProvenance', pg_catalog.jsonb_build_object(
      'type', 'automatic-collector',
      'publicLabel', 'Published from approved Tier 3 media evidence'
    ),
    'administrativeState', 'active',
    'revision', 1
  );
  if classstatus_private.notice_family_key('production', new_record)
       is distinct from 'v2f:c0636a3014ddd360a8aefc159d15416cbb082903c4d5d7091d6222e15d007f22'
     or classstatus_private.notice_event_key('production', new_record)
       is distinct from 'v2e:a5e57620f6c3b5dd944ce2f7faafb2696d93af82a0733e8357b85b39520102c9' then
    raise exception 'classstatus:cleanup-makati-canonical-key-mismatch';
  end if;

  insert into public.classstatus_suspensions (
    deployment_namespace, record_id, record, event_key, conflict_key,
    provenance_type, administrative_state, revision, published_at,
    created_at, updated_at
  ) values (
    'production', 'tier3-7d2be29935738601a447', new_record,
    'v2e:a5e57620f6c3b5dd944ce2f7faafb2696d93af82a0733e8357b85b39520102c9',
    'v2f:c0636a3014ddd360a8aefc159d15416cbb082903c4d5d7091d6222e15d007f22',
    'automatic-collector', 'active', 1,
    (makati_source ->> 'publishedAt')::timestamptz,
    cleanup_timestamp, cleanup_timestamp
  );
  insert into public.classstatus_audit_entries (
    deployment_namespace, action, outcome, record_id, target_summary,
    correlation_id, reason_code, effective_at
  ) values (
    'production', 'cleanup-makati-canonical-create', 'success',
    'tier3-7d2be29935738601a447',
    pg_catalog.jsonb_build_object(
      'recordId', 'tier3-7d2be29935738601a447',
      'oldRevision', null,
      'newRevision', 1,
      'oldEventKey', null,
      'newEventKey', 'v2e:a5e57620f6c3b5dd944ce2f7faafb2696d93af82a0733e8357b85b39520102c9',
      'oldConflictKey', null,
      'newConflictKey', 'v2f:c0636a3014ddd360a8aefc159d15416cbb082903c4d5d7091d6222e15d007f22',
      'removedFalseCitationFingerprints', '[]'::jsonb,
      'survivingCanonicalId', 'tier3-7d2be29935738601a447',
      'cleanupEffectiveDate', '2026-08-28',
      'cleanupMigrationIdentifier', migration_id
    )::text,
    migration_id, 'cleanup-makati-canonical-create', cleanup_timestamp
  );

  -- Retire, but never delete, every reviewed duplicate, false publication,
  -- and merged evidence donor. Source, parser, and legacy identity fields stay
  -- untouched in the historical record.
  for row_spec in
    select expected.*
    from cleanup_20260828_expected expected
    where expected.disposition in ('false-geography', 'stale-duplicate', 'evidence-merged')
    order by expected.record_id
  loop
    select suspension.* into strict stored
    from public.classstatus_suspensions suspension
    where suspension.deployment_namespace = 'production'
      and suspension.record_id = row_spec.record_id
      and suspension.revision = row_spec.expected_revision
      and suspension.event_key = row_spec.expected_event_key
      and suspension.conflict_key = row_spec.expected_conflict_key
    for update;

    retire_reason := case row_spec.disposition
      when 'false-geography' then 'cleanup-false-geography'
      when 'evidence-merged' then 'cleanup-evidence-merged'
      else 'cleanup-stale-duplicate'
    end;
    update public.classstatus_suspensions suspension
    set administrative_state = 'removed',
        removal_finalized_at = cleanup_timestamp,
        undo_deadline = null,
        revision = stored.revision + 1,
        updated_at = cleanup_timestamp,
        record = stored.record || pg_catalog.jsonb_build_object(
          'administrativeState', 'removed',
          'removalFinalizedAt', cleanup_timestamp,
          'revision', stored.revision + 1
        ) - 'removalRequestedAt' - 'undoDeadline'
    where suspension.deployment_namespace = 'production'
      and suspension.record_id = row_spec.record_id
      and suspension.revision = stored.revision
      and suspension.administrative_state = 'active';
    get diagnostics changed_count = row_count;
    if changed_count is distinct from 1 then
      raise exception 'classstatus:cleanup-retirement-stale-write:%', row_spec.record_id;
    end if;

    insert into public.classstatus_audit_entries (
      deployment_namespace, action, outcome, record_id, target_summary,
      correlation_id, reason_code, effective_at
    ) values (
      'production', 'cleanup-retire', 'success', row_spec.record_id,
      pg_catalog.jsonb_build_object(
        'recordId', row_spec.record_id,
        'oldRevision', stored.revision,
        'newRevision', stored.revision + 1,
        'oldEventKey', stored.event_key,
        'newEventKey', stored.event_key,
        'oldConflictKey', stored.conflict_key,
        'newConflictKey', stored.conflict_key,
        'survivingCanonicalId', row_spec.survivor_id,
        'cleanupEffectiveDate', '2026-08-28',
        'cleanupMigrationIdentifier', migration_id
      )::text,
      migration_id, retire_reason, cleanup_timestamp
    );
  end loop;

  -- Post-cleanup structural and semantic assertions. These inspect actual
  -- scope fields; they do not infer correctness from status counts alone.
  select pg_catalog.count(*) into actual_count
  from public.classstatus_suspensions suspension
  where suspension.deployment_namespace = 'production'
    and suspension.provenance_type = 'automatic-collector'
    and suspension.administrative_state = 'active'
    and suspension.record ->> 'effectiveDate' = '2026-08-28';
  if actual_count is distinct from 20 then
    raise exception 'classstatus:cleanup-post-active-count';
  end if;

  if exists (
    select 1
    from cleanup_20260828_final_all_day expected
    full join (
      select suspension.*
      from public.classstatus_suspensions suspension
      where suspension.deployment_namespace = 'production'
        and suspension.provenance_type = 'automatic-collector'
        and suspension.administrative_state = 'active'
        and suspension.record ->> 'effectiveDate' = '2026-08-28'
        and suspension.record -> 'isAllDay' = 'true'::jsonb
    ) actual on actual.record_id = expected.record_id
    where expected.record_id is null
       or actual.record_id is null
       or actual.record ->> 'lguId' is distinct from expected.lgu_id
       or actual.record ->> 'status' is distinct from expected.status
       or pg_catalog.jsonb_typeof(actual.record -> 'affectedLevels') is distinct from 'array'
       or actual.record -> 'affectedLevels' is distinct from expected.affected_levels
       or actual.record ->> 'schoolSector' is distinct from expected.school_sector
       or pg_catalog.jsonb_typeof(actual.record -> 'isAllDay') is distinct from 'boolean'
       or actual.record -> 'isAllDay' is distinct from 'true'::jsonb
  ) then
    raise exception 'classstatus:cleanup-post-exact-all-day-manifest';
  end if;

  if exists (
    select 1
    from cleanup_20260828_final_palace expected
    full join (
      select suspension.*
      from public.classstatus_suspensions suspension
      where suspension.deployment_namespace = 'production'
        and suspension.provenance_type = 'automatic-collector'
        and suspension.administrative_state = 'active'
        and suspension.record ->> 'effectiveDate' = '2026-08-28'
        and suspension.record -> 'isAllDay' = 'false'::jsonb
    ) actual on actual.record_id = expected.record_id
    where expected.record_id is null
       or actual.record_id is null
       or actual.record ->> 'lguId' is distinct from expected.lgu_id
       or actual.event_key is distinct from expected.event_key
       or actual.conflict_key is distinct from expected.family_key
       or actual.record ->> 'eventKey' is distinct from expected.event_key
       or actual.record ->> 'status' is distinct from 'partial-suspension'
       or pg_catalog.jsonb_typeof(actual.record -> 'affectedLevels') is distinct from 'array'
       or actual.record -> 'affectedLevels' is distinct from '["all-levels"]'::jsonb
       or actual.record ->> 'schoolSector' is distinct from 'all'
       or pg_catalog.jsonb_typeof(actual.record -> 'isAllDay') is distinct from 'boolean'
       or actual.record -> 'isAllDay' is distinct from 'false'::jsonb
       or pg_catalog.jsonb_typeof(actual.record -> 'startTime') is distinct from 'string'
       or actual.record ->> 'startTime' is distinct from '13:00'
       or pg_catalog.jsonb_typeof(actual.record -> 'endTime') is distinct from 'string'
       or actual.record ->> 'endTime' is distinct from '23:59'
  ) then
    raise exception 'classstatus:cleanup-post-exact-palace-manifest';
  end if;

  if exists (
    select 1
    from public.classstatus_suspensions suspension
    where suspension.deployment_namespace = 'production'
      and suspension.provenance_type = 'automatic-collector'
      and suspension.administrative_state = 'active'
      and suspension.record ->> 'effectiveDate' = '2026-08-28'
      and (
        suspension.record ? 'schoolId'
        or pg_catalog.jsonb_typeof(suspension.record) is distinct from 'object'
        or pg_catalog.jsonb_typeof(suspension.record -> 'id') is distinct from 'string'
        or coalesce(suspension.record ->> 'id', '') = ''
        or suspension.record ->> 'id' is distinct from suspension.record_id
        or coalesce(suspension.event_key, '') !~ '^v2e:[0-9a-f]{64}$'
        or coalesce(suspension.conflict_key, '') !~ '^v2f:[0-9a-f]{64}$'
        or pg_catalog.jsonb_typeof(suspension.record -> 'eventKey') is distinct from 'string'
        or suspension.record ->> 'eventKey' is distinct from suspension.event_key
        or pg_catalog.jsonb_typeof(suspension.record -> 'lguId') is distinct from 'string'
        or coalesce(suspension.record ->> 'lguId', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record -> 'status') is distinct from 'string'
        or coalesce(suspension.record ->> 'status', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record -> 'affectedLevels') is distinct from 'array'
        or pg_catalog.jsonb_array_length(suspension.record -> 'affectedLevels') = 0
        or pg_catalog.jsonb_typeof(suspension.record -> 'schoolSector') is distinct from 'string'
        or coalesce(suspension.record ->> 'schoolSector', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record -> 'effectiveDate') is distinct from 'string'
        or suspension.record ->> 'effectiveDate' is distinct from '2026-08-28'
        or pg_catalog.jsonb_typeof(suspension.record -> 'isAllDay') is distinct from 'boolean'
        or pg_catalog.jsonb_typeof(suspension.record -> 'source') is distinct from 'object'
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,id}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,id}', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,organization}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,organization}', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,url}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,url}', '') !~ '^https://'
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,evidenceFingerprint}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,evidenceFingerprint}', '') !~ '^[0-9a-f]{64}$'
        or pg_catalog.jsonb_typeof(suspension.record #> '{source,evidenceExcerpt}') is distinct from 'string'
        or coalesce(suspension.record #>> '{source,evidenceExcerpt}', '') = ''
        or pg_catalog.jsonb_typeof(suspension.record -> 'additionalSources') is distinct from 'array'
        or pg_catalog.jsonb_typeof(suspension.record -> 'parserOutcome') is distinct from 'string'
        or suspension.record ->> 'parserOutcome' is distinct from 'accepted:tier3-lgu-suspension:v2'
        or pg_catalog.jsonb_typeof(suspension.record -> 'administrativeState') is distinct from 'string'
        or suspension.record ->> 'administrativeState' is distinct from 'active'
        or pg_catalog.jsonb_typeof(suspension.record -> 'collectorProvenance') is distinct from 'object'
        or suspension.record #>> '{collectorProvenance,pipeline}' is distinct from 'tier3-media'
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(suspension.record -> 'additionalSources') source(value)
          where pg_catalog.jsonb_typeof(source.value) is distinct from 'object'
             or pg_catalog.jsonb_typeof(source.value -> 'id') is distinct from 'string'
             or coalesce(source.value ->> 'id', '') = ''
             or pg_catalog.jsonb_typeof(source.value -> 'organization') is distinct from 'string'
             or coalesce(source.value ->> 'organization', '') = ''
             or pg_catalog.jsonb_typeof(source.value -> 'url') is distinct from 'string'
             or coalesce(source.value ->> 'url', '') !~ '^https://'
             or pg_catalog.jsonb_typeof(source.value -> 'evidenceFingerprint') is distinct from 'string'
             or coalesce(source.value ->> 'evidenceFingerprint', '') !~ '^[0-9a-f]{64}$'
             or pg_catalog.jsonb_typeof(source.value -> 'evidenceExcerpt') is distinct from 'string'
             or coalesce(source.value ->> 'evidenceExcerpt', '') = ''
        )
        or classstatus_private.notice_event_key('production', suspension.record) is distinct from suspension.event_key
        or classstatus_private.notice_family_key('production', suspension.record) is distinct from suspension.conflict_key
      )
  ) then
    raise exception 'classstatus:cleanup-post-canonical-contract';
  end if;

  if (select pg_catalog.count(distinct suspension.event_key)
      from public.classstatus_suspensions suspension
      where suspension.deployment_namespace = 'production'
        and suspension.provenance_type = 'automatic-collector'
        and suspension.administrative_state = 'active'
        and suspension.record ->> 'effectiveDate' = '2026-08-28') is distinct from 20
     or (select pg_catalog.count(distinct (suspension.conflict_key, suspension.event_key))
         from public.classstatus_suspensions suspension
         where suspension.deployment_namespace = 'production'
           and suspension.provenance_type = 'automatic-collector'
           and suspension.administrative_state = 'active'
           and suspension.record ->> 'effectiveDate' = '2026-08-28') is distinct from 20 then
    raise exception 'classstatus:cleanup-post-duplicate-v2-identity';
  end if;

  if (select pg_catalog.count(*)
      from public.classstatus_suspensions suspension
      where suspension.deployment_namespace = 'production'
        and suspension.provenance_type = 'automatic-collector'
        and suspension.administrative_state = 'active'
        and suspension.record ->> 'effectiveDate' = '2026-08-28'
        and suspension.record -> 'isAllDay' = 'true'::jsonb
        and suspension.record ->> 'status' = 'classes-suspended'
        and suspension.record -> 'affectedLevels' = '["all-levels"]'::jsonb
        and suspension.record ->> 'schoolSector' = 'all') is distinct from 14 then
    raise exception 'classstatus:cleanup-post-full-scope-count';
  end if;

  if (select pg_catalog.array_agg(scope.lgu_id order by scope.lgu_id)
      from (
        select distinct suspension.record ->> 'lguId' as lgu_id
        from public.classstatus_suspensions suspension
        where suspension.deployment_namespace = 'production'
          and suspension.provenance_type = 'automatic-collector'
          and suspension.administrative_state = 'active'
          and suspension.record ->> 'effectiveDate' = '2026-08-28'
          and suspension.record ->> 'status' = 'partial-suspension'
      ) scope) is distinct from array['makati', 'pasig', 'pateros']::text[] then
    raise exception 'classstatus:cleanup-post-partial-lgu-set';
  end if;

  if exists (
    select 1
    from public.classstatus_suspensions suspension
    where suspension.deployment_namespace = 'production'
      and suspension.provenance_type = 'automatic-collector'
      and suspension.administrative_state = 'active'
      and suspension.record ->> 'effectiveDate' = '2026-08-28'
      and (
        pg_catalog.lower(coalesce(suspension.record #>> '{source,evidenceExcerpt}', '')) ~ '(agoo|malolos|bocaue|pulilan)'
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(coalesce(suspension.record -> 'additionalSources', '[]'::jsonb)) source(value)
          where pg_catalog.lower(coalesce(source.value ->> 'evidenceExcerpt', '')) ~ '(agoo|malolos|bocaue|pulilan)'
        )
      )
  ) then
    raise exception 'classstatus:cleanup-post-false-geography-evidence';
  end if;

  if (select pg_catalog.count(*)
      from public.classstatus_suspensions suspension
      join cleanup_20260828_expected expected on expected.record_id = suspension.record_id
      where suspension.deployment_namespace = 'production'
        and expected.disposition in ('false-geography', 'stale-duplicate', 'evidence-merged')
        and suspension.administrative_state = 'removed'
        and suspension.record ->> 'administrativeState' = 'removed'
        and suspension.removal_finalized_at = cleanup_timestamp
        and suspension.record ->> 'eventKey' = expected.expected_event_key
        and suspension.event_key = expected.expected_event_key
        and suspension.conflict_key = expected.expected_conflict_key
        and suspension.record ->> 'parserOutcome' = 'accepted:tier3-explicit-lgu-suspension') is distinct from 38 then
    raise exception 'classstatus:cleanup-post-historical-retirement';
  end if;

  if (select pg_catalog.count(*)
      from public.classstatus_audit_entries audit
      where audit.deployment_namespace = 'production'
        and audit.correlation_id = migration_id
        and audit.outcome = 'success') is distinct from 58 then
    raise exception 'classstatus:cleanup-post-audit-count';
  end if;
end
$cleanup$;

commit;
