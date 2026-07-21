export type AnnouncementItem = {
    icon: string;
    text: string;
};

type NavLink = {
    label: string;
    icon: string;
    href: string;
    highlighted?: boolean;
};

type SidebarCategory = {
    icon: string;
    title: string;
};

type Slide = {
    label: string;
    labelIcon: string;
    title: string;
    subtitle: string;
    description: string;
    price: string;
    original?: string;
    badge: string;
    image: string;
    cta: string;
    bgClass: string;
};

type Feature = {
    title: string;
    subtitle: string;
    icon: string;
    colorClass: string;
};

type CategoryCard = {
    title: string;
    subtitle: string;
    icon: string;
    colorClass: string;
};

type ProductCardData = {
    badge: string;
    badgeType: string;
    image: string;
    brand: string;
    name: string;
    stars: number;
    halfStar?: boolean;
    reviews: string;
    current: string;
    original?: string;
    save?: string;
};

type BannerCard = {
    badge: string;
    title: string;
    subtitle: string;
    link: string;
    ctaText: string;
    emoji: string;
    gradientClass: string;
};

type BrandCard = {
    label: string;
    name: string;
    description: string;
    logoClass: string;
};

type FooterLink = { label: string; href: string };

type FooterGroup = { title: string; links: FooterLink[] };

type HeaderAction = {
    label: string;
    icon: string;
    href?: string;
    badge?: string;
    highlighted?: boolean;
    buttonClass?: string;
};

type PromoCard = {
    badge: string;
    title: string;
    subtitle: string;
    linkText: string;
    linkIcon: string;
    variant: "red" | "dark";
};

type NewsletterContent = {
    title: string;
    subtitle: string;
    placeholder: string;
    buttonLabel: string;
};

type SectionContent = {
    title: string;
    subtitle: string;
    icon: string;
    iconColorClass: string;
    actionText: string;
};

export type {
    NavLink,
    SidebarCategory,
    Slide,
    Feature,
    CategoryCard,
    ProductCardData,
    BannerCard,
    BrandCard,
    FooterGroup,
    HeaderAction,
    PromoCard,
    NewsletterContent,
    SectionContent,
};

export const announcementItems: AnnouncementItem[] = [
    { icon: "fa-bolt", text: "Flash Sale LIVE — Up to 70% Off!" },
    { icon: "fa-truck-fast", text: "Free Delivery on Orders Above Rs 499" },
    { icon: "fa-shield-halved", text: "100% Genuine Products Guaranteed" },
    { icon: "fa-rotate-left", text: "Easy 15-Day Returns" },
    { icon: "fa-credit-card", text: "No-Cost EMI Available" },
];

export const navLinks: NavLink[] = [
    { label: "Home", icon: "fa-house", href: "/" },
    { label: "Mobiles", icon: "fa-mobile-screen", href: "/category" },
    { label: "TVs", icon: "fa-tv", href: "/category" },
    { label: "Laptops", icon: "fa-laptop", href: "/category" },
    { label: "Appliances", icon: "fa-blender", href: "/category" },
    { label: "Brands", icon: "fa-award", href: "/brands" },
    { label: "Blog", icon: "fa-newspaper", href: "/blog" },
    { label: "About", icon: "fa-building", href: "/about" },
    { label: "Offers", icon: "fa-bolt", href: "/offers", highlighted: true },
];

export const sidebarCategories: SidebarCategory[] = [
    { icon: "fa-mobile-screen-button", title: "Mobile Phones" },
    { icon: "fa-laptop", title: "Laptops & PCs" },
    { icon: "fa-tv", title: "Televisions" },
    { icon: "fa-blender", title: "Home Appliances" },
    { icon: "fa-headphones", title: "Audio & Sound" },
    { icon: "fa-camera", title: "Cameras" },
    { icon: "fa-clock", title: "Smartwatches" },
    { icon: "fa-gamepad", title: "Gaming" },
    { icon: "fa-plug", title: "Accessories" },
];

export const headerActions: HeaderAction[] = [
    { label: "Location", icon: "fas fa-location-dot" },
    { label: "Account", icon: "fas fa-user", href: "/account" },
    { label: "Wishlist", icon: "far fa-heart", href: "/wishlist", badge: "3" },
    { label: "Support", icon: "fas fa-headset", href: "/faq" },
    { label: "Cart (2)", icon: "fas fa-shopping-cart", href: "/cart", buttonClass: "cart-action" },
];

export const searchCategories = [
    "All Categories",
    "Mobile Phones",
    "Laptops",
    "Televisions",
    "Appliances",
    "Accessories",
];

export const heroSlides: Slide[] = [
    {
        label: "New Arrival",
        labelIcon: "fa-bolt",
        title: "iPhone 16 Pro Max",
        subtitle: "Now in India",
        description:
            "Titanium design. A18 Pro chip. 48MP camera system with 5x zoom. The most powerful iPhone ever.",
        price: "Rs 1,34,900",
        original: "Rs 1,49,900",
        badge: "10% OFF",
        image:
            "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=500&q=85",
        cta: "Shop Now",
        bgClass: "slide-bg-1",
    },
    {
        label: "Best Seller",
        labelIcon: "fa-star",
        title: "MacBook Air M3",
        subtitle: "Supercharged",
        description:
            "Blazingly fast. Up to 18 hours battery. Liquid Retina display. The world's best laptop just got better.",
        price: "Rs 1,14,990",
        original: "Rs 1,24,900",
        badge: "8% OFF",
        image:
            "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500&q=85",
        cta: "Explore",
        bgClass: "slide-bg-2",
    },
    {
        label: "Summer Sale",
        labelIcon: "fa-fire",
        title: "Smart Home",
        subtitle: "Mega Deals",
        description:
            "Smart ACs, Refrigerators, Washing Machines & more. Up to 50% off on top brands this summer.",
        price: "From Rs 12,990",
        badge: "UP TO 50% OFF",
        image:
            "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=500&q=85",
        cta: "View Deals",
        bgClass: "slide-bg-3",
    },
];

export const rightPromoCards: PromoCard[] = [
    {
        badge: "BANK OFFER",
        title: "Extra 10% Off with HDFC Cards",
        subtitle: "Max discount Rs 3,000",
        linkText: "Grab Now",
        linkIcon: "fa-arrow-right",
        variant: "red",
    },
    {
        badge: "EXCHANGE OFFER",
        title: "Get Up to Rs 25,000 on Exchange",
        subtitle: "Upgrade your old phone today",
        linkText: "Check Value",
        linkIcon: "fa-arrow-right",
        variant: "dark",
    },
];

export const features: Feature[] = [
    {
        title: "Free Delivery",
        subtitle: "On orders above Rs 499",
        icon: "fa-truck-fast",
        colorClass: "feat-red",
    },
    {
        title: "Genuine Products",
        subtitle: "100% authentic guarantee",
        icon: "fa-shield-halved",
        colorClass: "feat-blue",
    },
    {
        title: "Easy Returns",
        subtitle: "15-day hassle-free returns",
        icon: "fa-rotate-left",
        colorClass: "feat-green",
    },
    {
        title: "24/7 Support",
        subtitle: "Dedicated customer care",
        icon: "fa-headset",
        colorClass: "feat-purple",
    },
];

export const categoryCards: CategoryCard[] = [
    {
        title: "Smartphones",
        subtitle: "2500+ Products",
        icon: "fa-mobile-screen-button",
        colorClass: "ci-red",
    },
    {
        title: "Laptops",
        subtitle: "800+ Products",
        icon: "fa-laptop",
        colorClass: "ci-blue",
    },
    {
        title: "Televisions",
        subtitle: "600+ Products",
        icon: "fa-tv",
        colorClass: "ci-purple",
    },
    {
        title: "Headphones",
        subtitle: "1200+ Products",
        icon: "fa-headphones-simple",
        colorClass: "ci-orange",
    },
    {
        title: "Smartwatches",
        subtitle: "450+ Products",
        icon: "fa-clock",
        colorClass: "ci-green",
    },
    {
        title: "Cameras",
        subtitle: "300+ Products",
        icon: "fa-camera",
        colorClass: "ci-pink",
    },
    {
        title: "Gaming",
        subtitle: "900+ Products",
        icon: "fa-gamepad",
        colorClass: "ci-indigo",
    },
    {
        title: "Air Conditioners",
        subtitle: "400+ Products",
        icon: "fa-snowflake",
        colorClass: "ci-cyan",
    },
    {
        title: "Refrigerators",
        subtitle: "500+ Products",
        icon: "fa-box-open",
        colorClass: "ci-teal",
    },
    {
        title: "Washing Machine",
        subtitle: "350+ Products",
        icon: "fa-shirt",
        colorClass: "ci-amber",
    },
    {
        title: "Accessories",
        subtitle: "3000+ Products",
        icon: "fa-plug",
        colorClass: "ci-slate",
    },
];

export const flashProducts: ProductCardData[] = [
    {
        badge: "-35%",
        badgeType: "sale",
        image:
            "https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?w=400&q=80",
        brand: "Samsung",
        name: "Galaxy S24 Ultra 5G (256GB)",
        stars: 4,
        halfStar: true,
        reviews: "(4,582)",
        current: "Rs 84,999",
        original: "Rs 1,29,999",
        save: "Save Rs 45,000",
    },
    {
        badge: "NEW",
        badgeType: "new",
        image:
            "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80",
        brand: "Apple",
        name: 'MacBook Air 15" M3 Chip (512GB)',
        stars: 5,
        reviews: "(2,103)",
        current: "Rs 1,14,990",
        original: "Rs 1,34,900",
        save: "Save Rs 19,910",
    },
    {
        badge: "HOT",
        badgeType: "hot",
        image:
            "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&q=80",
        brand: "Sony",
        name: "WH-1000XM5 Noise Cancelling",
        stars: 4,
        halfStar: true,
        reviews: "(8,221)",
        current: "Rs 22,990",
        original: "Rs 34,990",
        save: "Save Rs 12,000",
    },
    {
        badge: "-40%",
        badgeType: "sale",
        image:
            "https://images.unsplash.com/photo-1593784991095-a205069470b6?w=400&q=80",
        brand: "LG",
        name: '55" OLED C4 4K Smart TV',
        stars: 4,
        reviews: "(1,456)",
        current: "Rs 89,990",
        original: "Rs 1,49,990",
        save: "Save Rs 60,000",
    },
    {
        badge: "BEST",
        badgeType: "best",
        image:
            "https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=400&q=80",
        brand: "Apple",
        name: "Watch Ultra 2 (GPS + Cellular)",
        stars: 5,
        reviews: "(3,891)",
        current: "Rs 79,900",
        original: "Rs 89,900",
        save: "Save Rs 10,000",
    },
];

export const bannerCards: BannerCard[] = [
    {
        badge: "SUPER DEAL",
        title: "Mobile Accessories Fest",
        subtitle: "Cases, chargers & earbuds from Rs 99",
        link: "#",
        ctaText: "Shop Now",
        emoji: "🔌",
        gradientClass: "banner-gradient-1",
    },
    {
        badge: "TRENDING",
        title: "Smart Home Devices",
        subtitle: "Alexa, smart lights, security cameras",
        link: "#",
        ctaText: "Explore",
        emoji: "🏠",
        gradientClass: "banner-gradient-2",
    },
    {
        badge: "LIMITED TIME",
        title: "Gaming Zone",
        subtitle: "Consoles, controllers & accessories",
        link: "#",
        ctaText: "Game On",
        emoji: "🎮",
        gradientClass: "banner-gradient-3",
    },
];

export const trendingProducts: ProductCardData[] = [
    {
        badge: "HOT",
        badgeType: "hot",
        image:
            "https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=400&q=80",
        brand: "OnePlus",
        name: "OnePlus 12 5G (256GB) Silky Black",
        stars: 4,
        halfStar: true,
        reviews: "(6,123)",
        current: "Rs 52,999",
        original: "Rs 64,999",
        save: "Save Rs 12,000",
    },
    {
        badge: "-25%",
        badgeType: "sale",
        image:
            "https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&q=80",
        brand: "Daikin",
        name: "1.5 Ton 5-Star Inverter Split AC",
        stars: 4,
        reviews: "(2,890)",
        current: "Rs 38,990",
        original: "Rs 52,990",
        save: "Save Rs 14,000",
    },
    {
        badge: "NEW",
        badgeType: "new",
        image:
            "https://images.unsplash.com/photo-1603351154351-5e2d0600bb77?w=400&q=80",
        brand: "Apple",
        name: "AirPods Pro 2 with USB-C (2nd Gen)",
        stars: 5,
        reviews: "(12,456)",
        current: "Rs 20,990",
        original: "Rs 24,900",
        save: "Save Rs 3,910",
    },
    {
        badge: "BEST",
        badgeType: "best",
        image:
            "https://images.unsplash.com/photo-1527443224154-c4a573d9e253?w=400&q=80",
        brand: "Dell",
        name: '27" 4K USB-C Monitor',
        stars: 4,
        halfStar: true,
        reviews: "(1,234)",
        current: "Rs 34,990",
        original: "Rs 44,990",
        save: "Save Rs 10,000",
    },
    {
        badge: "-30%",
        badgeType: "sale",
        image:
            "https://images.unsplash.com/photo-1584568694244-14fbdf83bd30?w=400&q=80",
        brand: "Samsung",
        name: "653L Side-by-Side Smart Refrigerator",
        stars: 4,
        reviews: "(987)",
        current: "Rs 64,990",
        original: "Rs 92,990",
        save: "Save Rs 28,000",
    },
];

export const brandCards: BrandCard[] = [
    {
        label: "A",
        name: "Apple",
        description: "iPhone, Mac, iPad & more",
        logoClass: "apple",
    },
    {
        label: "S",
        name: "Samsung",
        description: "Galaxy, TVs & Appliances",
        logoClass: "samsung",
    },
    { label: "1+", name: "OnePlus", description: "Never Settle", logoClass: "oneplus" },
    { label: "So", name: "Sony", description: "Audio, TV & Gaming", logoClass: "sony" },
    { label: "D", name: "Dell", description: "Laptops & Monitors", logoClass: "dell" },
    { label: "HP", name: "HP", description: "PCs & Printers", logoClass: "hp" },
    { label: "Le", name: "Lenovo", description: "ThinkPad & Legion", logoClass: "lenovo" },
    { label: "D", name: "Daikin", description: "Air Conditioners", logoClass: "daikin" },
    { label: "Mi", name: "Xiaomi", description: "Phones & Smart Home", logoClass: "xiaomi" },
];

export const footerGroups: FooterGroup[] = [
    {
        title: "Quick Links",
        links: [
            { label: "About Us", href: "/about" },
            { label: "Contact Us", href: "/#contact" },
            { label: "Brands", href: "/brands" },
            { label: "Blog", href: "/blog" },
            { label: "Today's Offers", href: "/offers" },
        ],
    },
    {
        title: "Customer Service",
        links: [
            { label: "Help Center", href: "/faq" },
            { label: "Track Order", href: "/account" },
            { label: "Return Policy", href: "/faq" },
            { label: "Warranty Info", href: "/faq" },
            { label: "EMI Options", href: "/faq" },
        ],
    },
    {
        title: "My Account",
        links: [
            { label: "Login / Register", href: "/login" },
            { label: "My Orders", href: "/account" },
            { label: "My Cart", href: "/cart" },
            { label: "Wishlist", href: "/wishlist" },
            { label: "Search Products", href: "/search" },
        ],
    },
];

export const footerSocialIcons = [
    "fa-facebook-f",
    "fa-twitter",
    "fa-instagram",
    "fa-youtube",
    "fa-linkedin-in",
];

export const dealFeatures = [
    "Free Galaxy Buds 3",
    "No-Cost EMI",
    "1 Year Warranty",
    "Free Delivery",
];

export const newsletterContent: NewsletterContent = {
    title: "Get Exclusive Deals in Your Inbox",
    subtitle: "Subscribe and get Rs 500 off on your first order!",
    placeholder: "Enter your email address",
    buttonLabel: "Subscribe",
};

export const pageCopy = {
    heroCta: "Shop Now",
    addToCart: "Add to Cart",
    buyNow: "Buy",
    viewAll: "View All",
    dealPrimary: "Buy Now",
    dealSecondary: "Add to Cart",
    footerCopyright: "© 2026 Motabhai Electronics. All rights reserved.",
};

export const sections: {
    category: SectionContent;
    flash: SectionContent;
    trending: SectionContent;
    deal: SectionContent;
    brands: SectionContent;
    newsletter: SectionContent;
} = {
    category: {
        title: "Shop by Category",
        subtitle: "Find exactly what you need",
        icon: "fa-th-large",
        iconColorClass: "si-red",
        actionText: "View All",
    },
    flash: {
        title: "Flash Deals",
        subtitle: "Hurry! Deals end soon",
        icon: "fa-bolt",
        iconColorClass: "si-orange",
        actionText: "View All",
    },
    trending: {
        title: "Trending Now",
        subtitle: "What everyone is buying",
        icon: "fa-fire-flame-curved",
        iconColorClass: "si-purple",
        actionText: "View All",
    },
    deal: {
        title: "Deal of the Day",
        subtitle: "Limited time premium savings",
        icon: "fa-clock",
        iconColorClass: "si-red",
        actionText: "",
    },
    brands: {
        title: "Top Brands",
        subtitle: "Shop from the brands you trust",
        icon: "fa-award",
        iconColorClass: "si-blue",
        actionText: "View All",
    },
    newsletter: {
        title: "Newsletter",
        subtitle: "",
        icon: "",
        iconColorClass: "",
        actionText: "",
    },
};
