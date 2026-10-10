import React from "react";

// Noted's own icon family. One grid and one weight for all of them: a 24 grid with the drawing kept inside 3–21,
// a 1.75px stroke with round caps and joins that stays 1.75px at any size (vector-effect, index.css), so a menu's
// 18px icon and a button's 22px one carry the same line. Filled only where fill is the meaning (a pinned pin, dots).
// Same API as react-icons: size (default 1em, so text size sets it) and any svg prop.
// Sizes in use: 22px in the round buttons and the toolbar menus, 18px in list menus and switches.
const icon = (paths) => {
    const Icon = ({ size = "1em", className = "", ...props }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`noted-icon ${className}`} {...props}>
            {paths}
        </svg>
    );
    return Icon;
};
const dot = (cx, cy, r = 1.4) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;

// General
export const NiPlus = icon(<path d="M12 5v14M5 12h14" />);
export const NiClose = icon(<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />);
export const NiCheck = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const NiSearch = icon(<><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>);
export const NiMore = icon(<>{dot(6, 12)}{dot(12, 12)}{dot(18, 12)}</>);
export const NiChevronRight = icon(<path d="M9.5 6l6 6-6 6" />);
export const NiChevronDown = icon(<path d="M6 9.5l6 6 6-6" />);
export const NiChevronUp = icon(<path d="M6 14.5l6-6 6 6" />);
export const NiAlert = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5" />{dot(12, 16, 1.1)}</>);
export const NiClock = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>);

// Notes
export const NiEdit = icon(<path d="M4.5 19.5h4l10-10a2.83 2.83 0 0 0-4-4l-10 10zM13 7l4 4" />);
export const NiTag = icon(<path d="M4 8a3 3 0 0 1 3-3h9l5 7-5 7H7a3 3 0 0 1-3-3z" />);
export const NiNone = icon(<><circle cx="12" cy="12" r="8.5" /><path d="M6 6l12 12" /></>);
export const NiTrash = icon(<path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M10 11v6M14 11v6" />);
const pinHead = "M9 3.5h6M10 3.5v5L7 13h10l-3-4.5v-5";
// Unpinned the pin leans 45°, like one lying loose; pinned it stands upright and filled.
export const NiPin = icon(<path d={`${pinHead}M12 13v7.5`} transform="rotate(45 12 12)" />);
export const NiPinFilled = icon(<><path d="M10 3.5h4v5l3 4.5H7l3-4.5z" fill="currentColor" /><path d={`${pinHead}M12 13v7.5`} /></>);
export const NiDuplicate = icon(<><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8M14 11v6M11 14h6" /></>);
export const NiCopy = icon(<><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></>);
export const NiCut = icon(<><circle cx="7" cy="17" r="3" /><circle cx="17" cy="17" r="3" /><path d="M9 14.5L16.5 4M15 14.5L7.5 4" /></>);
export const NiPaste = icon(<><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 5H7.5A2.5 2.5 0 0 0 5 7.5v11A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5v-11A2.5 2.5 0 0 0 16.5 5H15" /></>);
export const NiUndo = icon(<path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H12" />);
export const NiRedo = icon(<path d="M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H12" />);
export const NiRestart = icon(<path d="M4 12a8 8 0 1 0 2.35-5.65L4 8.5M4 4v4.5h4.5" />);

// Text
export const NiBold = icon(<path d="M7 5h5.5a3.5 3.5 0 0 1 0 7H7zM7 12h6.5a3.5 3.5 0 0 1 0 7H7z" />);
export const NiItalic = icon(<path d="M10 5h8M6 19h8M14 5l-4 14" />);
export const NiUnderline = icon(<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14" />);
export const NiStrike = icon(<path d="M16.5 7.5C16 6 14.3 5 12 5c-2.5 0-4 1.3-4 3 0 1.5 1 2.4 3 3M4.5 12h15M7.5 16.5C8 18 9.7 19 12 19c2.5 0 4-1.3 4-3 0-.8-.3-1.4-.8-2" />);
export const NiHeading = icon(<path d="M5 7V5h14v2M12 5v14M9 19h6" />);
export const NiAlignLeft = icon(<path d="M4 6h16M4 10h10M4 14h16M4 18h10" />);
export const NiAlignCenter = icon(<path d="M4 6h16M7 10h10M4 14h16M7 18h10" />);
export const NiAlignRight = icon(<path d="M4 6h16M10 10h10M4 14h16M10 18h10" />);
export const NiAlignJustify = icon(<path d="M4 6h16M4 10h16M4 14h16M4 18h16" />);
export const NiIndentMore = icon(<path d="M4 5h16M11 10h9M11 14h9M4 19h16M4 9l3 3-3 3" />);
export const NiIndentLess = icon(<path d="M4 5h16M11 10h9M11 14h9M4 19h16M7 9l-3 3 3 3" />);
export const NiListBullet = icon(<>{dot(5, 6)}{dot(5, 12)}{dot(5, 18)}<path d="M9.5 6H20M9.5 12H20M9.5 18H20" /></>);
export const NiListDash = icon(<path d="M4 6h2.5M4 12h2.5M4 18h2.5M9.5 6H20M9.5 12H20M9.5 18H20" />);
export const NiListNumber = icon(<path d="M4 4.5h1.5V9M4 9h3M4 15.5a1.5 1.5 0 0 1 3 0c0 1.5-3 2.5-3 4h3M10.5 6H20M10.5 12H20M10.5 18H20" />);
export const NiListCheck = icon(<path d="M4 7l1.75 1.75L9 5.5M4 17l1.75 1.75L9 15.5M12 7h8M12 17h8" />);

// Settings
export const NiSun = icon(<><circle cx="12" cy="12" r="3.5" /><path d="M12 3.5v1.5M12 19v1.5M3.5 12H5M19 12h1.5M6 6l1.06 1.06M16.94 16.94L18 18M6 18l1.06-1.06M16.94 7.06L18 6" /></>);
export const NiMoon = icon(<path d="M20.43 12.51A8.25 8.25 0 1 1 11.49 3.57A6.35 6.35 0 0 0 20.43 12.51z" />);
export const NiCornersRound = icon(<rect x="4" y="4" width="16" height="16" rx="5" />);
export const NiCornersCut = icon(<path d="M4 4h11a5 5 0 0 1 5 5v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z" />);
// The editor toolbar: a bar hovering over a dotted ground (floating) or resting on a solid one (fixed).
export const NiBarFloating = icon(<><rect x="5" y="6" width="14" height="6" rx="3" /><path d="M5 18h2M11 18h2M17 18h2" /></>);
export const NiBarFixed = icon(<><rect x="5" y="8" width="14" height="6" rx="3" /><path d="M3 16h18" /></>);
export const NiSortDown = icon(<path d="M7 4v16M4 17l3 3 3-3M13 6h7M13 11h5M13 16h3" />);
export const NiSortUp = icon(<path d="M7 20V4M4 7l3-3 3 3M13 6h3M13 11h5M13 16h7" />);
export const NiLock = icon(<><rect x="5" y="11" width="14" height="9.5" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>);
export const NiUnlock = icon(<><rect x="5" y="11" width="14" height="9.5" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 7.75-1.4" /></>);
export const NiLogout = icon(<path d="M9.5 20H7a2.5 2.5 0 0 1-2.5-2.5v-11A2.5 2.5 0 0 1 7 4h2.5M15.5 16l4-4-4-4M19.5 12H9.5" />);
export const NiEye = icon(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>);
export const NiEyeOff = icon(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /><path d="M4 4l16 16" /></>);
