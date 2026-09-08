/* @ds-bundle: {"format":4,"namespace":"InternHubDesignSystem_f6cc55","components":[{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"JobCard","sourcePath":"components/domain/JobCard.jsx"},{"name":"RoleBadge","sourcePath":"components/domain/RoleBadge.jsx"},{"name":"StatCard","sourcePath":"components/domain/StatCard.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"StatusPill","sourcePath":"components/feedback/StatusPill.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Field","sourcePath":"components/forms/Input.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"Switch","sourcePath":"components/forms/Switch.jsx"},{"name":"Textarea","sourcePath":"components/forms/Textarea.jsx"},{"name":"Pagination","sourcePath":"components/navigation/Pagination.jsx"},{"name":"SideNav","sourcePath":"components/navigation/SideNav.jsx"},{"name":"Tabs","sourcePath":"components/navigation/Tabs.jsx"}],"sourceHashes":{"components/core/Avatar.jsx":"ad56d4e5376c","components/core/Badge.jsx":"892b7b4360b5","components/core/Button.jsx":"ee0c6bc00590","components/core/Card.jsx":"16c607125c06","components/core/Icon.jsx":"5d5349ba2874","components/core/IconButton.jsx":"515d41aa1eb1","components/domain/JobCard.jsx":"bae73df3a04e","components/domain/RoleBadge.jsx":"463ee9dec548","components/domain/StatCard.jsx":"ec2c7a77b7f6","components/feedback/EmptyState.jsx":"015f1e4906ad","components/feedback/StatusPill.jsx":"a6308300c42e","components/feedback/Toast.jsx":"7bcb9949c2c7","components/forms/Checkbox.jsx":"74c8c05a55ac","components/forms/Input.jsx":"d912a9461e25","components/forms/Select.jsx":"33dcf0b94876","components/forms/Switch.jsx":"4a4e2f65c2b9","components/forms/Textarea.jsx":"8b95dbeba526","components/navigation/Pagination.jsx":"59a9e54b9408","components/navigation/SideNav.jsx":"2b620eb0cd5c","components/navigation/Tabs.jsx":"855a342bda6c","ui_kits/admin_console/AdminScreens.jsx":"542d43292a8b","ui_kits/admin_console/AdminShell.jsx":"8dae1398ec98","ui_kits/candidate_web/CandidateScreens.jsx":"fa9ed025c45f","ui_kits/candidate_web/CandidateShell.jsx":"e9243d00c779","ui_kits/candidate_web/SearchScreen.jsx":"432e5f470e50","ui_kits/employer_portal/EmployerShell.jsx":"7ddfc2d245a4","ui_kits/employer_portal/JobScreens.jsx":"0f701e6fbae4","ui_kits/employer_portal/PeopleScreens.jsx":"4dd04e183014","ui_kits/marketing_site/Data.jsx":"f85f573afc8c","ui_kits/marketing_site/Sections.jsx":"93208fcfdbc8"},"inlinedExternals":[],"unexposedExports":[{"name":"fieldShell","sourcePath":"components/forms/Input.jsx"},{"name":"roleVocabulary","sourcePath":"components/domain/RoleBadge.jsx"},{"name":"statusVocabulary","sourcePath":"components/feedback/StatusPill.jsx"}]} */

(() => {

const __ds_ns = (window.InternHubDesignSystem_f6cc55 = window.InternHubDesignSystem_f6cc55 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const boxes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80
};
function initials(name = "") {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  const last = parts[parts.length - 1];
  return (parts.length > 1 ? last[0] + parts[0][0] : parts[0].slice(0, 2)).toUpperCase();
}

/** Person or company identity chip. Companies get a squared radius, people a circle. */
function Avatar({
  name = "",
  src,
  size = "md",
  shape,
  role,
  style,
  ...rest
}) {
  const box = boxes[size] || boxes.md;
  const kind = shape || (role === "employer" ? "square" : "circle");
  const ring = role ? {
    employer: "var(--role-employer)",
    admin: "var(--role-admin)",
    candidate: "var(--role-candidate)"
  }[role] : null;
  return /*#__PURE__*/React.createElement("span", _extends({
    title: name,
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flex: "none",
      width: box,
      height: box,
      borderRadius: kind === "square" ? "var(--radius-md)" : "var(--radius-pill)",
      background: src ? "var(--surface-sunken)" : "var(--pine-100)",
      color: "var(--pine-800)",
      font: "var(--type-label)",
      fontSize: Math.max(11, Math.round(box * 0.36)),
      letterSpacing: "var(--tracking-wide)",
      overflow: "hidden",
      boxShadow: ring ? `0 0 0 2px var(--surface-card), 0 0 0 3px ${ring}` : "none",
      ...style
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name,
    style: {
      width: "100%",
      height: "100%",
      objectFit: "cover"
    }
  }) : initials(name));
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const pads = {
  none: 0,
  sm: "var(--space-3)",
  md: "var(--space-4)",
  lg: "var(--space-6)"
};

/** The house surface: white, 1px --border-subtle, 10px radius, --shadow-xs. */
function Card({
  padding = "md",
  interactive = false,
  selected = false,
  tone = "default",
  as = "div",
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const Tag = as;
  const tones = {
    default: {
      background: "var(--surface-card)",
      borderColor: "var(--border-subtle)"
    },
    brand: {
      background: "var(--surface-brand-soft)",
      borderColor: "var(--pine-100)"
    },
    sunken: {
      background: "var(--surface-sunken)",
      borderColor: "transparent",
      boxShadow: "none"
    },
    warning: {
      background: "var(--feedback-warning-soft)",
      borderColor: "var(--marigold-100)"
    }
  };
  return /*#__PURE__*/React.createElement(Tag, _extends({
    onMouseEnter: interactive ? () => setHover(true) : undefined,
    onMouseLeave: interactive ? () => setHover(false) : undefined,
    style: {
      borderRadius: "var(--radius-lg)",
      border: "var(--border-w) solid",
      boxShadow: "var(--shadow-xs)",
      padding: pads[padding],
      transition: "var(--transition-surface)",
      ...tones[tone],
      ...(interactive ? {
        cursor: "pointer"
      } : null),
      ...(hover ? {
        boxShadow: "var(--shadow-md)",
        borderColor: "var(--border-default)"
      } : null),
      ...(selected ? {
        borderColor: "var(--border-brand)",
        boxShadow: "var(--shadow-xs), inset 0 0 0 1px var(--pine-500)"
      } : null),
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const CDN = "https://cdn.jsdelivr.net/npm/lucide-static@0.544.0/icons";
const cache = new Map();

/** Lucide icon, fetched as real SVG markup and inked with currentColor. */
function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  style,
  title,
  ...rest
}) {
  const [markup, setMarkup] = React.useState(() => cache.get(name) || "");
  React.useEffect(() => {
    if (cache.has(name)) {
      setMarkup(cache.get(name));
      return;
    }
    let alive = true;
    fetch(`${CDN}/${name}.svg`).then(r => r.ok ? r.text() : "").then(t => {
      const svg = t.replace(/width="24"/, 'width="100%"').replace(/height="24"/, 'height="100%"').replace(/stroke-width="2"/, `stroke-width="${strokeWidth}"`);
      cache.set(name, svg);
      if (alive) setMarkup(svg);
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [name, strokeWidth]);
  return /*#__PURE__*/React.createElement("span", _extends({
    role: title ? "img" : "presentation",
    "aria-label": title,
    "aria-hidden": title ? undefined : true,
    dangerouslySetInnerHTML: {
      __html: markup
    },
    style: {
      display: "inline-flex",
      flex: "none",
      width: size,
      height: size,
      lineHeight: 0,
      color: "currentColor",
      ...style
    }
  }, rest));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const tones = {
  neutral: ["var(--n-100)", "var(--n-700)"],
  brand: ["var(--pine-50)", "var(--pine-700)"],
  accent: ["var(--marigold-50)", "var(--marigold-600)"],
  success: ["var(--green-50)", "var(--green-600)"],
  warning: ["var(--marigold-50)", "var(--marigold-600)"],
  danger: ["var(--red-50)", "var(--red-600)"],
  info: ["var(--blue-50)", "var(--blue-600)"]
};

/** Small non-interactive label for counts, categories and attributes. */
function Badge({
  tone = "neutral",
  icon,
  variant = "soft",
  children,
  style,
  ...rest
}) {
  const [bg, fg] = tones[tone] || tones.neutral;
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-1)",
      height: 22,
      padding: "0 var(--space-2)",
      borderRadius: "var(--radius-sm)",
      font: "var(--type-meta)",
      letterSpacing: "var(--tracking-normal)",
      background: variant === "outline" ? "transparent" : bg,
      color: fg,
      border: variant === "outline" ? "var(--border-w) solid currentColor" : "var(--border-w) solid transparent",
      ...style
    }
  }, rest), icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 13
  }) : null, children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const base = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  fontFamily: "var(--font-core)",
  fontWeight: "var(--weight-semibold)",
  letterSpacing: "var(--tracking-snug)",
  borderRadius: "var(--radius-md)",
  border: "var(--border-w) solid transparent",
  cursor: "pointer",
  textDecoration: "none",
  whiteSpace: "nowrap",
  transition: "var(--transition-control)"
};
const sizes = {
  sm: {
    height: "var(--control-sm)",
    padding: "0 var(--space-3)",
    fontSize: "var(--text-sm)"
  },
  md: {
    height: "var(--control-md)",
    padding: "0 var(--space-4)",
    fontSize: "var(--text-base)"
  },
  lg: {
    height: "var(--control-lg)",
    padding: "0 var(--space-5)",
    fontSize: "var(--text-md)"
  }
};
const variants = {
  primary: {
    rest: {
      background: "var(--action-primary-bg)",
      color: "var(--action-primary-fg)"
    },
    hover: {
      background: "var(--action-primary-bg-hover)"
    }
  },
  secondary: {
    rest: {
      background: "var(--action-secondary-bg)",
      color: "var(--action-secondary-fg)",
      borderColor: "var(--border-default)",
      boxShadow: "var(--shadow-xs)"
    },
    hover: {
      background: "var(--pine-50)",
      borderColor: "var(--pine-200)"
    }
  },
  ghost: {
    rest: {
      background: "transparent",
      color: "var(--action-ghost-fg)"
    },
    hover: {
      background: "var(--surface-hover)",
      color: "var(--text-strong)"
    }
  },
  accent: {
    rest: {
      background: "var(--action-accent-bg)",
      color: "var(--action-accent-fg)"
    },
    hover: {
      background: "var(--marigold-400)"
    }
  },
  danger: {
    rest: {
      background: "var(--action-danger-bg)",
      color: "var(--n-0)"
    },
    hover: {
      background: "var(--red-600)"
    }
  },
  link: {
    rest: {
      background: "transparent",
      color: "var(--text-link)",
      padding: 0,
      height: "auto"
    },
    hover: {
      color: "var(--text-link-hover)",
      textDecoration: "underline"
    }
  }
};

/** The primary action control. One primary button per view. */
function Button({
  variant = "primary",
  size = "md",
  icon,
  iconAfter,
  fullWidth = false,
  loading = false,
  disabled = false,
  as = "button",
  children,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [press, setPress] = React.useState(false);
  const v = variants[variant] || variants.primary;
  const off = disabled || loading;
  const Tag = as;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    disabled: Tag === "button" ? off : undefined,
    "aria-busy": loading || undefined,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => {
      setHover(false);
      setPress(false);
    },
    onMouseDown: () => setPress(true),
    onMouseUp: () => setPress(false),
    style: {
      ...base,
      ...sizes[size],
      ...v.rest,
      ...(hover && !off ? v.hover : null),
      ...(press && !off ? {
        transform: "translateY(0.5px)",
        filter: "brightness(0.96)"
      } : null),
      ...(fullWidth ? {
        width: "100%"
      } : null),
      ...(off ? {
        background: variant === "ghost" || variant === "link" ? "transparent" : "var(--surface-disabled)",
        color: "var(--text-subtle)",
        borderColor: "transparent",
        boxShadow: "none",
        cursor: "not-allowed"
      } : null),
      ...style
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "loader-circle",
    size: size === "sm" ? 15 : 17,
    style: {
      animation: "none",
      opacity: 0.8
    }
  }) : icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === "sm" ? 15 : 17
  }) : null, children, iconAfter ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconAfter,
    size: size === "sm" ? 15 : 17
  }) : null);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const boxes = {
  sm: 32,
  md: 40,
  lg: 48
};

/** Square icon-only control for toolbars, cards and table rows. */
function IconButton({
  icon,
  label,
  variant = "ghost",
  size = "md",
  active = false,
  disabled = false,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const box = boxes[size];
  const skins = {
    ghost: {
      background: "transparent",
      color: "var(--action-ghost-fg)",
      borderColor: "transparent"
    },
    outline: {
      background: "var(--surface-card)",
      color: "var(--text-body)",
      borderColor: "var(--border-default)"
    },
    solid: {
      background: "var(--action-primary-bg)",
      color: "var(--action-primary-fg)",
      borderColor: "transparent"
    }
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    "aria-label": label,
    title: label,
    "aria-pressed": active || undefined,
    disabled: disabled,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: box,
      height: box,
      flex: "none",
      borderRadius: "var(--radius-md)",
      border: "var(--border-w) solid",
      cursor: disabled ? "not-allowed" : "pointer",
      transition: "var(--transition-control)",
      ...skins[variant],
      ...(active ? {
        background: "var(--pine-50)",
        color: "var(--pine-700)",
        borderColor: "var(--pine-200)"
      } : null),
      ...(hover && !disabled && !active ? variant === "solid" ? {
        background: "var(--action-primary-bg-hover)"
      } : {
        background: "var(--surface-hover)",
        color: "var(--text-strong)"
      } : null),
      ...(disabled ? {
        color: "var(--text-subtle)",
        background: "transparent"
      } : null),
      ...style
    }
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: size === "sm" ? 16 : size === "lg" ? 22 : 18
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/domain/RoleBadge.jsx
try { (() => {
const ROLES = {
  candidate: {
    label: "Ứng viên",
    icon: "graduation-cap",
    fg: "var(--role-candidate-ink)",
    bg: "var(--role-candidate-soft)",
    solid: "var(--role-candidate)"
  },
  employer: {
    label: "Nhà tuyển dụng",
    icon: "building-2",
    fg: "var(--role-employer-ink)",
    bg: "var(--role-employer-soft)",
    solid: "var(--role-employer)"
  },
  admin: {
    label: "Quản trị viên",
    icon: "shield-check",
    fg: "var(--role-admin-ink)",
    bg: "var(--role-admin-soft)",
    solid: "var(--role-admin)"
  }
};

/** Names which of the three actors an object or session belongs to. */
function RoleBadge({
  role = "candidate",
  label,
  variant = "soft",
  showIcon = true,
  style
}) {
  const r = ROLES[role] || ROLES.candidate;
  const solid = variant === "solid";
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-1)",
      height: 24,
      padding: "0 var(--space-2)",
      borderRadius: "var(--radius-sm)",
      background: solid ? r.solid : r.bg,
      color: solid ? "var(--n-0)" : r.fg,
      font: "var(--type-meta)",
      whiteSpace: "nowrap",
      ...style
    }
  }, showIcon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: r.icon,
    size: 13
  }) : null, label || r.label);
}
const roleVocabulary = ROLES;
Object.assign(__ds_scope, { RoleBadge, roleVocabulary });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/domain/RoleBadge.jsx", error: String((e && e.message) || e) }); }

// components/domain/StatCard.jsx
try { (() => {
/** Single dashboard metric. Deltas are neutral facts, not celebrations. */
function StatCard({
  label,
  value,
  unit,
  icon,
  delta,
  deltaTone = "neutral",
  hint,
  style
}) {
  const tone = {
    up: "var(--green-600)",
    down: "var(--red-600)",
    neutral: "var(--text-muted)"
  }[deltaTone];
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    padding: "md",
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-2)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 28,
      height: 28,
      borderRadius: "var(--radius-sm)",
      background: "var(--pine-50)",
      color: "var(--pine-600)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 16
  })) : null, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, label)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      gap: "var(--space-15)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-h1)",
      color: "var(--text-strong)",
      letterSpacing: "var(--tracking-tight)"
    }
  }, value), unit ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, unit) : null), delta || hint ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-1)",
      font: "var(--type-body-sm)",
      color: tone
    }
  }, delta ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: deltaTone === "down" ? "trending-down" : "trending-up",
    size: 14
  }) : null, delta, hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-muted)"
    }
  }, hint) : null) : null);
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/domain/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/** Zero-results / nothing-yet state. Always names the next useful action. */
function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  tone = "default",
  compact = false,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: "var(--space-2)",
      padding: compact ? "var(--space-6) var(--space-4)" : "var(--space-12) var(--space-6)",
      borderRadius: "var(--radius-lg)",
      border: "var(--border-w) dashed var(--border-default)",
      background: tone === "brand" ? "var(--surface-brand-soft)" : "var(--surface-card)",
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 44,
      height: 44,
      borderRadius: "var(--radius-pill)",
      background: tone === "brand" ? "var(--pine-100)" : "var(--surface-sunken)",
      color: tone === "brand" ? "var(--pine-700)" : "var(--text-muted)",
      marginBottom: "var(--space-1)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 22
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-strong)"
    }
  }, title), description ? /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)",
      maxWidth: 380
    }
  }, description) : null, action ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-2)"
    }
  }, action) : null);
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/StatusPill.jsx
try { (() => {
const STATUS = {
  draft: {
    label: "Nháp",
    icon: "file-pen",
    fg: "var(--status-draft-fg)",
    bg: "var(--status-draft-bg)"
  },
  review: {
    label: "Chờ duyệt",
    icon: "clock",
    fg: "var(--status-review-fg)",
    bg: "var(--status-review-bg)"
  },
  published: {
    label: "Đang hiển thị",
    icon: "circle-check",
    fg: "var(--status-published-fg)",
    bg: "var(--status-published-bg)"
  },
  closed: {
    label: "Đã đóng",
    icon: "archive",
    fg: "var(--status-closed-fg)",
    bg: "var(--status-closed-bg)"
  },
  expired: {
    label: "Hết hạn",
    icon: "calendar-x",
    fg: "var(--status-expired-fg)",
    bg: "var(--status-expired-bg)"
  },
  takendown: {
    label: "Đã hạ",
    icon: "shield-alert",
    fg: "var(--status-takendown-fg)",
    bg: "var(--status-takendown-bg)"
  }
};

/** The canonical job-post lifecycle state. One vocabulary across all three roles. */
function StatusPill({
  status = "draft",
  label,
  size = "md",
  showIcon = true,
  style
}) {
  const s = STATUS[status] || STATUS.draft;
  const sm = size === "sm";
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-1)",
      height: sm ? 20 : 24,
      padding: sm ? "0 var(--space-15)" : "0 var(--space-2)",
      borderRadius: "var(--radius-pill)",
      background: s.bg,
      color: s.fg,
      font: "var(--type-meta)",
      fontSize: sm ? "var(--text-2xs)" : "var(--text-xs)",
      border: status === "expired" ? "var(--border-w) solid var(--border-default)" : "var(--border-w) solid transparent",
      whiteSpace: "nowrap",
      ...style
    }
  }, showIcon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: s.icon,
    size: sm ? 11 : 13
  }) : null, label || s.label);
}
const statusVocabulary = STATUS;
Object.assign(__ds_scope, { StatusPill, statusVocabulary });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/StatusPill.jsx", error: String((e && e.message) || e) }); }

// components/domain/JobCard.jsx
try { (() => {
function Meta({
  icon,
  children
}) {
  if (!children) return null;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-1)",
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14
  }), children);
}

/** The job posting row/tile — the most repeated object in the product. */
function JobCard({
  title,
  company,
  logo,
  location,
  salary,
  deadline,
  tags = [],
  status,
  verified = false,
  isNew = false,
  saved = false,
  selected = false,
  onSave,
  onClick,
  footer,
  style
}) {
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    interactive: !!onClick,
    selected: selected,
    onClick: onClick,
    padding: "md",
    style: {
      display: "flex",
      gap: "var(--space-3)",
      ...style
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Avatar, {
    name: company,
    src: logo,
    role: "employer",
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-15)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-strong)"
    }
  }, title), isNew ? /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "accent"
  }, "M\u1EDBi") : null, status ? /*#__PURE__*/React.createElement(__ds_scope.StatusPill, {
    status: status,
    size: "sm"
  }) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-1)",
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, company, verified ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "badge-check",
    size: 14,
    style: {
      color: "var(--pine-500)"
    },
    title: "\u0110\xE3 x\xE1c th\u1EF1c"
  }) : null)), onSave ? /*#__PURE__*/React.createElement(__ds_scope.IconButton, {
    icon: "bookmark",
    label: saved ? "Bỏ lưu" : "Lưu tin",
    active: saved,
    size: "sm",
    onClick: e => {
      e.stopPropagation();
      onSave();
    }
  }) : null), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "var(--space-4)",
      marginTop: 2
    }
  }, /*#__PURE__*/React.createElement(Meta, {
    icon: "map-pin"
  }, location), /*#__PURE__*/React.createElement(Meta, {
    icon: "wallet"
  }, salary), /*#__PURE__*/React.createElement(Meta, {
    icon: "calendar-clock"
  }, deadline)), tags.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "var(--space-15)",
      marginTop: "var(--space-1)"
    }
  }, tags.map(t => /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    key: t
  }, t))) : null, footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-2)"
    }
  }, footer) : null));
}
Object.assign(__ds_scope, { JobCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/domain/JobCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
const tones = {
  success: {
    icon: "circle-check",
    fg: "var(--green-600)",
    bar: "var(--green-500)",
    bg: "var(--green-50)"
  },
  info: {
    icon: "info",
    fg: "var(--blue-600)",
    bar: "var(--blue-500)",
    bg: "var(--blue-50)"
  },
  warning: {
    icon: "triangle-alert",
    fg: "var(--marigold-600)",
    bar: "var(--marigold-400)",
    bg: "var(--marigold-50)"
  },
  danger: {
    icon: "circle-x",
    fg: "var(--red-600)",
    bar: "var(--red-500)",
    bg: "var(--red-50)"
  }
};

/** Transient confirmation or error. Also usable inline as a static notice. */
function Toast({
  tone = "success",
  title,
  description,
  action,
  onDismiss,
  inline = false,
  style
}) {
  const t = tones[tone] || tones.success;
  return /*#__PURE__*/React.createElement("div", {
    role: "status",
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: "var(--space-3)",
      width: inline ? "100%" : 380,
      padding: "var(--space-3) var(--space-4)",
      borderRadius: "var(--radius-lg)",
      background: inline ? t.bg : "var(--surface-card)",
      border: "var(--border-w) solid",
      borderColor: inline ? "transparent" : "var(--border-subtle)",
      boxShadow: inline ? "none" : "var(--shadow-lg)",
      borderLeft: `3px solid ${t.bar}`,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: t.fg,
      display: "inline-flex",
      marginTop: 1
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: t.icon,
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, title), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, description) : null, action ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "var(--space-2)"
    }
  }, action) : null), onDismiss ? /*#__PURE__*/React.createElement("button", {
    onClick: onDismiss,
    "aria-label": "\u0110\xF3ng",
    style: {
      background: "none",
      border: "none",
      cursor: "pointer",
      color: "var(--text-subtle)",
      padding: 2,
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "x",
    size: 16
  })) : null);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
/** Checkbox with inline label. Also renders the indeterminate (partial) state. */
function Checkbox({
  label,
  description,
  checked = false,
  indeterminate = false,
  disabled,
  onChange,
  id,
  style
}) {
  const uid = id || React.useId();
  const on = checked || indeterminate;
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: uid,
    style: {
      display: "inline-flex",
      alignItems: description ? "flex-start" : "center",
      gap: "var(--space-2)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    id: uid,
    type: "checkbox",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: "absolute",
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: 18,
      height: 18,
      flex: "none",
      marginTop: description ? 2 : 0,
      borderRadius: "var(--radius-xs)",
      border: "var(--border-w-thick) solid",
      borderColor: on ? "var(--pine-500)" : "var(--border-strong)",
      background: on ? "var(--pine-500)" : "var(--surface-card)",
      color: "var(--n-0)",
      transition: "var(--transition-control)"
    }
  }, indeterminate ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "minus",
    size: 13
  }) : checked ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 13
  }) : null), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, label), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, description) : null));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const fieldShell = {
  width: "100%",
  fontFamily: "var(--font-core)",
  fontSize: "var(--text-base)",
  color: "var(--text-strong)",
  background: "var(--surface-card)",
  border: "var(--border-w) solid var(--border-default)",
  borderRadius: "var(--radius-md)",
  transition: "var(--transition-control)",
  outline: "none"
};

/** Label + hint + error wrapper shared by every form control. */
function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-15)",
      ...style
    }
  }, label ? /*#__PURE__*/React.createElement("label", {
    htmlFor: htmlFor,
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, label, required ? /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--text-danger)",
      marginLeft: 2
    }
  }, "*") : null) : null, children, error ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-danger)",
      display: "inline-flex",
      gap: "var(--space-1)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "circle-alert",
    size: 14
  }), error) : hint ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, hint) : null);
}

/** Single-line text field, optionally with leading/trailing icons. */
function Input({
  label,
  hint,
  error,
  required,
  icon,
  iconAfter,
  size = "md",
  disabled,
  id,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  const h = size === "sm" ? "var(--control-sm)" : size === "lg" ? "var(--control-lg)" : "var(--control-md)";
  return /*#__PURE__*/React.createElement(Field, {
    label: label,
    hint: hint,
    error: error,
    required: required,
    htmlFor: uid,
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center"
    }
  }, icon ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      left: 12,
      display: "inline-flex",
      color: focus ? "var(--pine-500)" : "var(--text-subtle)",
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 17
  })) : null, /*#__PURE__*/React.createElement("input", _extends({
    id: uid,
    disabled: disabled,
    "aria-invalid": !!error || undefined,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...fieldShell,
      height: h,
      paddingLeft: icon ? 38 : "var(--space-3)",
      paddingRight: iconAfter ? 38 : "var(--space-3)",
      fontSize: size === "sm" ? "var(--text-sm)" : "var(--text-base)",
      ...(focus ? {
        borderColor: "var(--border-focus)",
        boxShadow: "var(--ring-focus)"
      } : null),
      ...(error ? {
        borderColor: "var(--red-500)",
        boxShadow: focus ? "var(--ring-danger)" : "none"
      } : null),
      ...(disabled ? {
        background: "var(--surface-disabled)",
        color: "var(--text-subtle)",
        cursor: "not-allowed"
      } : null)
    }
  }, rest)), iconAfter ? /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 12,
      display: "inline-flex",
      color: "var(--text-subtle)",
      pointerEvents: "none"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: iconAfter,
    size: 17
  })) : null));
}
Object.assign(__ds_scope, { fieldShell, Field, Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Native select styled to match Input, with the house chevron. */
function Select({
  label,
  hint,
  error,
  required,
  options = [],
  size = "md",
  disabled,
  id,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  const h = size === "sm" ? "var(--control-sm)" : size === "lg" ? "var(--control-lg)" : "var(--control-md)";
  return /*#__PURE__*/React.createElement(__ds_scope.Field, {
    label: label,
    hint: hint,
    error: error,
    required: required,
    htmlFor: uid,
    style: style
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: "relative",
      display: "flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("select", _extends({
    id: uid,
    disabled: disabled,
    "aria-invalid": !!error || undefined,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...__ds_scope.fieldShell,
      height: h,
      padding: "0 34px 0 var(--space-3)",
      fontSize: size === "sm" ? "var(--text-sm)" : "var(--text-base)",
      appearance: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      ...(focus ? {
        borderColor: "var(--border-focus)",
        boxShadow: "var(--ring-focus)"
      } : null),
      ...(error ? {
        borderColor: "var(--red-500)"
      } : null),
      ...(disabled ? {
        background: "var(--surface-disabled)",
        color: "var(--text-subtle)"
      } : null)
    }
  }, rest), options.map(o => {
    const opt = typeof o === "string" ? {
      value: o,
      label: o
    } : o;
    return /*#__PURE__*/React.createElement("option", {
      key: opt.value,
      value: opt.value
    }, opt.label);
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      right: 11,
      color: "var(--text-muted)",
      pointerEvents: "none",
      display: "inline-flex"
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-down",
    size: 16
  }))));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/forms/Switch.jsx
try { (() => {
/** Binary setting that applies immediately (no Save button). */
function Switch({
  label,
  description,
  checked = false,
  disabled,
  onChange,
  id,
  style
}) {
  const uid = id || React.useId();
  return /*#__PURE__*/React.createElement("label", {
    htmlFor: uid,
    style: {
      display: "inline-flex",
      alignItems: description ? "flex-start" : "center",
      gap: "var(--space-3)",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("input", {
    id: uid,
    type: "checkbox",
    role: "switch",
    checked: checked,
    disabled: disabled,
    onChange: onChange,
    style: {
      position: "absolute",
      opacity: 0,
      width: 0,
      height: 0
    }
  }), /*#__PURE__*/React.createElement("span", {
    "aria-hidden": "true",
    style: {
      position: "relative",
      width: 38,
      height: 22,
      flex: "none",
      borderRadius: "var(--radius-pill)",
      background: checked ? "var(--pine-500)" : "var(--n-300)",
      transition: "background-color var(--duration-base) var(--ease-standard)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: "absolute",
      top: 3,
      left: checked ? 19 : 3,
      width: 16,
      height: 16,
      borderRadius: "var(--radius-pill)",
      background: "var(--n-0)",
      boxShadow: "var(--shadow-sm)",
      transition: "left var(--duration-base) var(--ease-standard)"
    }
  })), label || description ? /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, label), description ? /*#__PURE__*/React.createElement("span", {
    style: {
      display: "block",
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, description) : null) : null);
}
Object.assign(__ds_scope, { Switch });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Switch.jsx", error: String((e && e.message) || e) }); }

// components/forms/Textarea.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Multi-line text with optional character counter. */
function Textarea({
  label,
  hint,
  error,
  required,
  rows = 4,
  maxLength,
  value,
  id,
  disabled,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const uid = id || React.useId();
  return /*#__PURE__*/React.createElement(__ds_scope.Field, {
    label: label,
    hint: hint,
    error: error,
    required: required,
    htmlFor: uid,
    style: style
  }, /*#__PURE__*/React.createElement("textarea", _extends({
    id: uid,
    rows: rows,
    maxLength: maxLength,
    value: value,
    disabled: disabled,
    "aria-invalid": !!error || undefined,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      ...__ds_scope.fieldShell,
      padding: "var(--space-3)",
      lineHeight: "var(--leading-normal)",
      resize: "vertical",
      ...(focus ? {
        borderColor: "var(--border-focus)",
        boxShadow: "var(--ring-focus)"
      } : null),
      ...(error ? {
        borderColor: "var(--red-500)"
      } : null),
      ...(disabled ? {
        background: "var(--surface-disabled)",
        cursor: "not-allowed"
      } : null)
    }
  }, rest)), maxLength ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)",
      textAlign: "right"
    }
  }, (value || "").length, "/", maxLength) : null);
}
Object.assign(__ds_scope, { Textarea });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Textarea.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Pagination.jsx
try { (() => {
function pages(page, total) {
  const out = [];
  for (let i = 1; i <= total; i += 1) {
    if (i === 1 || i === total || Math.abs(i - page) <= 1) out.push(i);else if (out[out.length - 1] !== "…") out.push("…");
  }
  return out;
}

/** Numbered pagination for job lists, applicant tables and moderation queues. */
function Pagination({
  page = 1,
  total = 1,
  onChange,
  summary,
  style
}) {
  const step = n => onChange && onChange(Math.min(total, Math.max(1, n)));
  const cell = on => ({
    minWidth: 32,
    height: 32,
    padding: "0 var(--space-2)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "var(--radius-md)",
    border: "var(--border-w) solid",
    borderColor: on ? "var(--pine-500)" : "var(--border-default)",
    background: on ? "var(--pine-50)" : "var(--surface-card)",
    color: on ? "var(--pine-700)" : "var(--text-body)",
    font: "var(--type-label)",
    cursor: "pointer",
    transition: "var(--transition-control)"
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      ...style
    }
  }, summary ? /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)",
      marginRight: "auto"
    }
  }, summary) : null, /*#__PURE__*/React.createElement("button", {
    onClick: () => step(page - 1),
    disabled: page === 1,
    style: {
      ...cell(false),
      opacity: page === 1 ? 0.45 : 1
    },
    "aria-label": "Trang tr\u01B0\u1EDBc"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-left",
    size: 16
  })), pages(page, total).map((p, i) => p === "…" ? /*#__PURE__*/React.createElement("span", {
    key: `e${i}`,
    style: {
      color: "var(--text-subtle)",
      padding: "0 2px"
    }
  }, "\u2026") : /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => step(p),
    style: cell(p === page),
    "aria-current": p === page || undefined
  }, p)), /*#__PURE__*/React.createElement("button", {
    onClick: () => step(page + 1),
    disabled: page === total,
    style: {
      ...cell(false),
      opacity: page === total ? 0.45 : 1
    },
    "aria-label": "Trang sau"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevron-right",
    size: 16
  })));
}
Object.assign(__ds_scope, { Pagination });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Pagination.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SideNav.jsx
try { (() => {
const roleInk = {
  candidate: ["var(--role-candidate)", "var(--role-candidate-soft)", "var(--role-candidate-ink)"],
  employer: ["var(--role-employer)", "var(--role-employer-soft)", "var(--role-employer-ink)"],
  admin: ["var(--role-admin)", "var(--role-admin-soft)", "var(--role-admin-ink)"]
};

/** App-shell left navigation. The role tints the active item and the rail edge. */
function SideNav({
  role = "candidate",
  items = [],
  value,
  onChange,
  header,
  footer,
  style
}) {
  const [hover, setHover] = React.useState(null);
  const [accent, soft, ink] = roleInk[role] || roleInk.candidate;
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      width: "var(--sidenav-w)",
      flex: "none",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-1)",
      padding: "var(--space-4) var(--space-3)",
      background: "var(--surface-card)",
      borderRight: "var(--border-w) solid var(--border-subtle)",
      boxShadow: `inset 3px 0 0 ${accent}`,
      ...style
    }
  }, header ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "0 var(--space-2) var(--space-4)"
    }
  }, header) : null, items.map(raw => {
    if (raw.section) {
      return /*#__PURE__*/React.createElement("div", {
        key: `s-${raw.section}`,
        style: {
          font: "var(--type-eyebrow)",
          textTransform: "uppercase",
          letterSpacing: "var(--tracking-caps)",
          color: "var(--text-subtle)",
          padding: "var(--space-4) var(--space-2) var(--space-1)"
        }
      }, raw.section);
    }
    const on = raw.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: raw.value,
      onClick: () => onChange && onChange(raw.value),
      onMouseEnter: () => setHover(raw.value),
      onMouseLeave: () => setHover(null),
      style: {
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        width: "100%",
        minHeight: 38,
        padding: "0 var(--space-2)",
        borderRadius: "var(--radius-md)",
        border: "none",
        textAlign: "left",
        cursor: "pointer",
        font: "var(--type-label)",
        background: on ? soft : hover === raw.value ? "var(--surface-hover)" : "transparent",
        color: on ? ink : "var(--text-body)",
        transition: "var(--transition-control)"
      }
    }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: raw.icon,
      size: 18,
      style: {
        color: on ? accent : "var(--text-muted)"
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        flex: 1
      }
    }, raw.label), raw.count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--type-meta)",
        padding: "1px var(--space-15)",
        borderRadius: "var(--radius-pill)",
        background: on ? "var(--surface-card)" : "var(--surface-sunken)",
        color: on ? ink : "var(--text-muted)"
      }
    }, raw.count) : null);
  }), footer ? /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: "auto",
      paddingTop: "var(--space-4)"
    }
  }, footer) : null);
}
Object.assign(__ds_scope, { SideNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SideNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Tabs.jsx
try { (() => {
/** Underlined tab bar for switching views inside a page. */
function Tabs({
  items = [],
  value,
  onChange,
  size = "md",
  style
}) {
  const [hover, setHover] = React.useState(null);
  return /*#__PURE__*/React.createElement("div", {
    role: "tablist",
    style: {
      display: "flex",
      alignItems: "stretch",
      gap: "var(--space-5)",
      borderBottom: "var(--border-w) solid var(--border-default)",
      ...style
    }
  }, items.map(raw => {
    const it = typeof raw === "string" ? {
      value: raw,
      label: raw
    } : raw;
    const on = it.value === value;
    return /*#__PURE__*/React.createElement("button", {
      key: it.value,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange && onChange(it.value),
      onMouseEnter: () => setHover(it.value),
      onMouseLeave: () => setHover(null),
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-2)",
        padding: size === "sm" ? "var(--space-2) 0" : "var(--space-3) 0",
        marginBottom: -1,
        background: "none",
        border: "none",
        borderBottom: "var(--border-w-thick) solid",
        borderColor: on ? "var(--pine-500)" : "transparent",
        color: on ? "var(--text-strong)" : hover === it.value ? "var(--text-body)" : "var(--text-muted)",
        font: "var(--type-label)",
        fontSize: size === "sm" ? "var(--text-sm)" : "var(--text-base)",
        cursor: "pointer",
        transition: "var(--transition-control)"
      }
    }, it.icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
      name: it.icon,
      size: 16
    }) : null, it.label, it.count != null ? /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--type-meta)",
        padding: "1px var(--space-15)",
        borderRadius: "var(--radius-sm)",
        background: on ? "var(--pine-50)" : "var(--surface-sunken)",
        color: on ? "var(--pine-700)" : "var(--text-muted)"
      }
    }, it.count) : null);
  }));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Tabs.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin_console/AdminScreens.jsx
try { (() => {
var {
  Icon,
  Avatar,
  Badge,
  Button,
  IconButton,
  Card,
  StatusPill,
  StatCard,
  RoleBadge,
  Tabs,
  Input,
  Select,
  Textarea,
  Checkbox,
  Switch,
  EmptyState,
  Toast,
  Pagination
} = window.InternHubDesignSystem_f6cc55;
function ADashScreen({
  go
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gap: "var(--space-5)",
      maxWidth: "var(--layout-max)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    icon: "shield-check",
    label: "Ch\u1EDD x\xE1c th\u1EF1c doanh nghi\u1EC7p",
    value: 2,
    unit: "c\xF4ng ty"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "file-check-2",
    label: "Tin ch\u1EDD duy\u1EC7t",
    value: 3,
    unit: "tin",
    hint: "SLA n\u1ED9i b\u1ED9: 1 ng\xE0y l\xE0m vi\u1EC7c"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "flag",
    label: "B\xE1o c\xE1o vi ph\u1EA1m",
    value: 1,
    delta: "+1",
    deltaTone: "up",
    hint: "h\xF4m nay"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "users",
    label: "Ng\u01B0\u1EDDi d\xF9ng ho\u1EA1t \u0111\u1ED9ng",
    value: "12.408",
    delta: "+312",
    deltaTone: "up",
    hint: "th\xE1ng n\xE0y"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      flex: 1
    }
  }, "Tin ch\u1EDD duy\u1EC7t"), /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    onClick: () => go("queue")
  }, "M\u1EDF h\xE0ng \u0111\u1EE3i")), QUEUE.filter(q => q.status === "review").map(q => /*#__PURE__*/React.createElement("div", {
    key: q.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      paddingBottom: "var(--space-3)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: q.company,
    role: "employer",
    size: "md"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "grid",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, q.title), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, q.company, " \xB7 ", q.submitted)), q.flags.length ? /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    icon: "triangle-alert"
  }, q.flags.length) : null, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: () => go("queue")
  }, "Xem")))), /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      flex: 1
    }
  }, "Doanh nghi\u1EC7p ch\u1EDD x\xE1c th\u1EF1c"), /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    onClick: () => go("verify")
  }, "Xem t\u1EA5t c\u1EA3")), COMPANIES.filter(c => c.state === "pending").map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      paddingBottom: "var(--space-3)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: c.name,
    role: "employer",
    size: "md"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "grid",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, c.name), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-mono)",
      color: "var(--text-muted)"
    }
  }, "MST ", c.tax)), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)"
    }
  }, c.submitted), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: () => go("verify")
  }, "X\xE9t h\u1ED3 s\u01A1"))))));
}
function VerifyScreen({
  onAction
}) {
  const [openId, setOpenId] = React.useState(301);
  const [decided, setDecided] = React.useState({});
  const stateOf = c => decided[c.id] || c.state;
  const open = COMPANIES.find(c => c.id === openId);
  const pill = {
    pending: ["warning", "Chờ xác thực"],
    verified: ["success", "Đã xác thực"],
    rejected: ["danger", "Từ chối"]
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-6)",
      padding: "var(--space-6)",
      alignItems: "flex-start",
      maxWidth: "var(--layout-max)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "grid",
      gap: "var(--space-3)"
    }
  }, COMPANIES.map(c => {
    const [tone, label] = pill[stateOf(c)];
    return /*#__PURE__*/React.createElement(Card, {
      key: c.id,
      interactive: true,
      selected: c.id === openId,
      onClick: () => setOpenId(c.id),
      padding: "md",
      style: {
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)"
      }
    }, /*#__PURE__*/React.createElement(Avatar, {
      name: c.name,
      role: "employer",
      size: "lg"
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        minWidth: 0,
        display: "grid",
        gap: 2
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)"
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--type-h3)",
        color: "var(--text-strong)"
      }
    }, c.name), /*#__PURE__*/React.createElement(Badge, {
      tone: tone
    }, label)), /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--type-body-sm)",
        color: "var(--text-muted)"
      }
    }, "MST ", c.tax, " \xB7 ", c.city, " \xB7 ", c.contact)), /*#__PURE__*/React.createElement("span", {
      style: {
        font: "var(--type-meta)",
        color: "var(--text-subtle)"
      }
    }, "G\u1EEDi ", c.submitted));
  })), /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      width: 400,
      flex: "none",
      display: "grid",
      gap: "var(--space-4)",
      position: "sticky",
      top: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-1)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-h2)",
      fontSize: "var(--text-xl)"
    }
  }, open.name), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-mono)",
      color: "var(--text-muted)"
    }
  }, "MST ", open.tax)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "Gi\u1EA5y t\u1EDD \u0111\xE3 g\u1EEDi"), open.docs.map(d => /*#__PURE__*/React.createElement(Card, {
    key: d,
    tone: "sunken",
    padding: "sm",
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 16,
    style: {
      color: "var(--pine-600)"
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: "var(--type-body-sm)",
      color: "var(--text-strong)"
    }
  }, d), /*#__PURE__*/React.createElement(IconButton, {
    icon: "external-link",
    label: "M\u1EDF",
    size: "sm"
  })))), /*#__PURE__*/React.createElement(Textarea, {
    label: "Ghi ch\xFA ki\u1EC3m duy\u1EC7t",
    rows: 3,
    maxLength: 400,
    value: "",
    onChange: () => {},
    hint: "Ghi ch\xFA hi\u1EC3n th\u1ECB trong l\u1ECBch s\u1EED x\u1EED l\xFD, kh\xF4ng g\u1EEDi cho doanh nghi\u1EC7p."
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-2)",
      borderTop: "var(--border-w) solid var(--border-subtle)",
      paddingTop: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "shield-check",
    onClick: () => {
      setDecided({
        ...decided,
        [open.id]: "verified"
      });
      onAction("Đã xác thực " + open.name + ".", "success");
    }
  }, "X\xE1c th\u1EF1c doanh nghi\u1EC7p"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "mail",
    onClick: () => onAction("Đã yêu cầu doanh nghiệp bổ sung giấy tờ.", "info")
  }, "Y\xEAu c\u1EA7u b\u1ED5 sung gi\u1EA5y t\u1EDD"), /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    icon: "x",
    onClick: () => {
      setDecided({
        ...decided,
        [open.id]: "rejected"
      });
      onAction("Đã từ chối hồ sơ doanh nghiệp.", "danger");
    }
  }, "T\u1EEB ch\u1ED1i h\u1ED3 s\u01A1"))));
}
function QueueScreen({
  onAction
}) {
  const [tab, setTab] = React.useState("review");
  const [state, setState] = React.useState({});
  const statusOf = q => state[q.id] || q.status;
  const rows = QUEUE.filter(q => statusOf(q) === tab);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gap: "var(--space-4)",
      maxWidth: 1080
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: "review",
      label: "Chờ duyệt",
      count: QUEUE.filter(q => statusOf(q) === "review").length
    }, {
      value: "published",
      label: "Đã duyệt",
      count: QUEUE.filter(q => statusOf(q) === "published").length
    }, {
      value: "takendown",
      label: "Đã hạ",
      count: QUEUE.filter(q => statusOf(q) === "takendown").length
    }]
  }), rows.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    compact: true,
    icon: "check-check",
    title: "H\xE0ng \u0111\u1EE3i tr\u1ED1ng",
    description: "Kh\xF4ng c\xF2n tin n\xE0o \u1EDF tr\u1EA1ng th\xE1i n\xE0y."
  }) : rows.map(q => /*#__PURE__*/React.createElement(Card, {
    key: q.id,
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-3)",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: q.company,
    role: "employer",
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "grid",
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      flexWrap: "wrap"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-strong)"
    }
  }, q.title), /*#__PURE__*/React.createElement(StatusPill, {
    status: statusOf(q),
    size: "sm"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, q.company, q.verified ? /*#__PURE__*/React.createElement(Badge, {
    tone: "brand",
    icon: "badge-check"
  }, "\u0110\xE3 x\xE1c th\u1EF1c") : /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    icon: "clock"
  }, "Ch\u01B0a x\xE1c th\u1EF1c"), /*#__PURE__*/React.createElement("span", null, "\xB7 ", q.location, " \xB7 ", q.salary, " \xB7 G\u1EEDi ", q.submitted)))), q.flags.length ? /*#__PURE__*/React.createElement(Toast, {
    inline: true,
    tone: "warning",
    title: "C\u1EA7n ki\u1EC3m tra",
    description: q.flags.join(" · ")
  }) : /*#__PURE__*/React.createElement(Toast, {
    inline: true,
    tone: "info",
    title: "Kh\xF4ng ph\xE1t hi\u1EC7n d\u1EA5u hi\u1EC7u b\u1EA5t th\u01B0\u1EDDng",
    description: "Doanh nghi\u1EC7p \u0111\xE3 x\xE1c th\u1EF1c, m\u1EE9c l\u01B0\u01A1ng trong kho\u1EA3ng th\xF4ng th\u01B0\u1EDDng."
  }), statusOf(q) === "review" ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "check",
    onClick: () => {
      setState({
        ...state,
        [q.id]: "published"
      });
      onAction("Đã duyệt và hiển thị tin.", "success");
    }
  }, "Duy\u1EC7t tin"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "pencil",
    onClick: () => onAction("Đã gửi yêu cầu sửa cho nhà tuyển dụng.", "info")
  }, "Y\xEAu c\u1EA7u s\u1EEDa"), /*#__PURE__*/React.createElement(Button, {
    variant: "danger",
    icon: "ban",
    onClick: () => {
      setState({
        ...state,
        [q.id]: "takendown"
      });
      onAction("Đã hạ tin và thông báo cho doanh nghiệp.", "danger");
    }
  }, "H\u1EA1 tin")) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "rotate-ccw",
    onClick: () => {
      setState({
        ...state,
        [q.id]: "review"
      });
      onAction("Đã trả tin về hàng đợi.", "info");
    }
  }, "\u0110\u01B0a v\u1EC1 ch\u1EDD duy\u1EC7t"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    icon: "history"
  }, "L\u1ECBch s\u1EED x\u1EED l\xFD")))));
}
function UsersScreen({
  onAction
}) {
  const [q, setQ] = React.useState("");
  const [role, setRole] = React.useState("Tất cả vai trò");
  const map = {
    "Ứng viên": "candidate",
    "Nhà tuyển dụng": "employer",
    "Quản trị viên": "admin"
  };
  const rows = USERS.filter(u => (role === "Tất cả vai trò" || u.role === map[role]) && (u.name + u.email).toLowerCase().includes(q.toLowerCase()));
  const th = {
    textAlign: "left",
    font: "var(--type-meta)",
    fontSize: "var(--text-2xs)",
    textTransform: "uppercase",
    letterSpacing: "var(--tracking-caps)",
    color: "var(--text-muted)",
    padding: "var(--space-3) var(--space-4)"
  };
  const td = {
    padding: "var(--space-3) var(--space-4)",
    font: "var(--type-body-sm)",
    color: "var(--text-body)"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gap: "var(--space-4)",
      maxWidth: 1080
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "sm",
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: "T\xECm theo t\xEAn ho\u1EB7c email\u2026",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Select, {
    value: role,
    onChange: e => setRole(e.target.value),
    options: ["Tất cả vai trò", "Ứng viên", "Nhà tuyển dụng", "Quản trị viên"],
    style: {
      width: 200
    }
  })), /*#__PURE__*/React.createElement(Card, {
    padding: "none",
    style: {
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "var(--surface-sunken)"
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Ng\u01B0\u1EDDi d\xF9ng"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Vai tr\xF2"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Email"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Tham gia"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Tr\u1EA1ng th\xE1i"), /*#__PURE__*/React.createElement("th", {
    style: th
  }))), /*#__PURE__*/React.createElement("tbody", null, rows.map(u => /*#__PURE__*/React.createElement("tr", {
    key: u.id,
    style: {
      borderTop: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: td
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: u.name,
    role: u.role,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, u.name))), /*#__PURE__*/React.createElement("td", {
    style: td
  }, /*#__PURE__*/React.createElement(RoleBadge, {
    role: u.role
  })), /*#__PURE__*/React.createElement("td", {
    style: {
      ...td,
      fontFamily: "var(--font-mono)",
      fontSize: "var(--text-xs)"
    }
  }, u.email), /*#__PURE__*/React.createElement("td", {
    style: td
  }, u.joined), /*#__PURE__*/React.createElement("td", {
    style: td
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: u.state === "Hoạt động" ? "success" : "danger"
  }, u.state)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...td,
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    onClick: () => onAction(u.state === "Hoạt động" ? "Đã tạm khóa tài khoản." : "Đã mở lại tài khoản.", "info")
  }, u.state === "Hoạt động" ? "Tạm khóa" : "Mở khóa"))))))));
}
function SettingsScreen({
  onAction
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gap: "var(--space-4)",
      maxWidth: 720
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", null, "Quy t\u1EAFc duy\u1EC7t tin"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)",
      marginTop: 4
    }
  }, "C\u1EA5u h\xECnh \xE1p d\u1EE5ng cho to\xE0n b\u1ED9 doanh nghi\u1EC7p; c\xF3 th\u1EC3 ghi \u0111\xE8 theo t\u1EEBng c\xF4ng ty.")), /*#__PURE__*/React.createElement(Switch, {
    label: "Tin c\u1EE7a c\xF4ng ty \u0111\xE3 x\xE1c th\u1EF1c hi\u1EC3n th\u1ECB ngay",
    description: "B\u1ECF qua b\u01B0\u1EDBc ch\u1EDD duy\u1EC7t cho doanh nghi\u1EC7p \u0111\xE3 x\xE1c th\u1EF1c.",
    checked: true,
    onChange: () => {}
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "B\u1EAFt bu\u1ED9c c\xF3 m\u1EE9c l\u01B0\u01A1ng",
    description: "Tin thi\u1EBFu m\u1EE9c l\u01B0\u01A1ng s\u1EBD b\u1ECB tr\u1EA3 l\u1EA1i t\u1EF1 \u0111\u1ED9ng.",
    checked: true,
    onChange: () => {}
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "T\u1EF1 \u0111\u1ED9ng h\u1EBFt h\u1EA1n sau 60 ng\xE0y",
    checked: false,
    onChange: () => {}
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Ng\u01B0\u1EDDi duy\u1EC7t m\u1EB7c \u0111\u1ECBnh",
    options: ["Lê Thu Hà", "Đội kiểm duyệt nội dung"]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "save",
    onClick: () => onAction("Đã lưu cấu hình duyệt.", "success")
  }, "L\u01B0u c\u1EA5u h\xECnh"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "H\u1EE7y"))), /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    tone: "warning",
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--marigold-600)"
    }
  }, "T\xEDnh n\u0103ng AI ch\u01B0a b\u1EADt"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, "Ph\xE2n t\xEDch CV v\xE0 g\u1EE3i \xFD \u1EE9ng vi\xEAn \u0111ang \u1EDF giai \u0111o\u1EA1n chu\u1EA9n b\u1ECB h\u1EA1 t\u1EA7ng. Khi b\u1EADt, m\u1EE5c c\u1EA5u h\xECnh ri\xEAng s\u1EBD xu\u1EA5t hi\u1EC7n t\u1EA1i \u0111\xE2y.")));
}
Object.assign(window, {
  ADashScreen,
  VerifyScreen,
  QueueScreen,
  UsersScreen,
  SettingsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin_console/AdminScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/admin_console/AdminShell.jsx
try { (() => {
var {
  Icon,
  Avatar,
  Badge,
  Button,
  IconButton,
  Card,
  StatusPill,
  StatCard,
  RoleBadge,
  Tabs,
  Input,
  Select,
  Textarea,
  Checkbox,
  Switch,
  EmptyState,
  Toast,
  Pagination
} = window.InternHubDesignSystem_f6cc55;
var COMPANIES = [{
  id: 301,
  name: "Công ty TNHH Minh Phát",
  tax: "0401998233",
  city: "Đà Nẵng",
  submitted: "01/09/2026",
  state: "pending",
  docs: ["GiayPhepKinhDoanh.pdf", "CCCD_NguoiDaiDien.pdf"],
  contact: "Trần Văn Minh"
}, {
  id: 302,
  name: "Sunrise Digital Agency",
  tax: "0316552210",
  city: "TP. Hồ Chí Minh",
  submitted: "31/08/2026",
  state: "pending",
  docs: ["GiayPhepKinhDoanh.pdf"],
  contact: "Nguyễn Hải Yến"
}, {
  id: 303,
  name: "FPT Software",
  tax: "0101248141",
  city: "Hà Nội",
  submitted: "12/07/2026",
  state: "verified",
  docs: ["GiayPhepKinhDoanh.pdf"],
  contact: "Phạm Thu Trang"
}, {
  id: 304,
  name: "Beta Trading JSC",
  tax: "0109887712",
  city: "Hà Nội",
  submitted: "20/08/2026",
  state: "rejected",
  docs: ["GiayPhepKinhDoanh.pdf"],
  contact: "Lý Đức Anh"
}];
var QUEUE = [{
  id: 401,
  title: "Thực tập sinh Kiểm thử phần mềm",
  company: "FPT Software",
  verified: true,
  status: "review",
  submitted: "02/09/2026",
  salary: "Thỏa thuận",
  location: "Hà Nội",
  flags: []
}, {
  id: 402,
  title: "Thực tập sinh Sales — thu nhập 20 triệu",
  company: "Sunrise Digital Agency",
  verified: false,
  status: "review",
  submitted: "02/09/2026",
  salary: "20 triệu / tháng",
  location: "TP. Hồ Chí Minh",
  flags: ["Mức lương bất thường", "Công ty chưa xác thực"]
}, {
  id: 403,
  title: "Thực tập sinh Kế toán",
  company: "Công ty TNHH Minh Phát",
  verified: false,
  status: "review",
  submitted: "01/09/2026",
  salary: "3 triệu / tháng",
  location: "Đà Nẵng",
  flags: ["Công ty chưa xác thực"]
}, {
  id: 404,
  title: "Thực tập sinh Thiết kế UI",
  company: "Beta Trading JSC",
  verified: false,
  status: "takendown",
  submitted: "15/08/2026",
  salary: "Thỏa thuận",
  location: "Hà Nội",
  flags: ["Báo cáo từ 3 sinh viên"]
}];
var USERS = [{
  id: 501,
  name: "Nguyễn Minh Anh",
  role: "candidate",
  email: "minhanh@sinhvien.hust.edu.vn",
  joined: "12/03/2026",
  state: "Hoạt động"
}, {
  id: 502,
  name: "Phạm Thu Trang",
  role: "employer",
  email: "trang.pham@fpt-software.com",
  joined: "05/01/2026",
  state: "Hoạt động"
}, {
  id: 503,
  name: "Lý Đức Anh",
  role: "employer",
  email: "duc.anh@betatrading.vn",
  joined: "18/08/2026",
  state: "Tạm khóa"
}, {
  id: 504,
  name: "Lê Thu Hà",
  role: "admin",
  email: "ha.le@internhub.vn",
  joined: "01/12/2025",
  state: "Hoạt động"
}];
var A_NAV = [{
  value: "dash",
  label: "Tổng quan",
  icon: "layout-dashboard"
}, {
  section: "Kiểm duyệt"
}, {
  value: "verify",
  label: "Xác thực doanh nghiệp",
  icon: "shield-check",
  count: 2
}, {
  value: "queue",
  label: "Duyệt tin tuyển dụng",
  icon: "file-check-2",
  count: 3
}, {
  value: "reports",
  label: "Báo cáo vi phạm",
  icon: "flag",
  count: 1
}, {
  section: "Hệ thống"
}, {
  value: "users",
  label: "Người dùng",
  icon: "users"
}, {
  value: "settings",
  label: "Cấu hình duyệt",
  icon: "settings"
}];
function ATopBar({
  title,
  right
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: "var(--topbar-h)",
      flex: "none",
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      padding: "0 var(--space-6)",
      background: "var(--surface-card)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h2)",
      fontSize: "var(--text-xl)",
      flex: 1
    }
  }, title), right, /*#__PURE__*/React.createElement(RoleBadge, {
    role: "admin"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "bell",
    label: "Th\xF4ng b\xE1o"
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "L\xEA Thu H\xE0",
    role: "admin",
    size: "sm"
  }));
}
function ALogo() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    alt: "",
    style: {
      height: 24
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-wordmark.svg",
    alt: "InternHub",
    style: {
      height: 15
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--role-admin)",
      letterSpacing: "var(--tracking-caps)",
      textTransform: "uppercase",
      fontSize: 10
    }
  }, "B\u1EA3ng qu\u1EA3n tr\u1ECB")));
}
Object.assign(window, {
  COMPANIES,
  QUEUE,
  USERS,
  A_NAV,
  ATopBar,
  ALogo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/admin_console/AdminShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/candidate_web/CandidateScreens.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
var {
  Icon,
  Avatar,
  Badge,
  Button,
  IconButton,
  Card,
  JobCard,
  Tabs,
  EmptyState,
  Input,
  Switch,
  Checkbox,
  StatusPill
} = window.InternHubDesignSystem_f6cc55;
function SavedScreen({
  savedIds,
  toggleSave
}) {
  const list = JOBS.filter(j => savedIds.includes(j.id));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gap: "var(--space-4)",
      maxWidth: 880
    }
  }, list.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    icon: "bookmark",
    tone: "brand",
    title: "Ch\u01B0a c\xF3 tin n\xE0o \u0111\u01B0\u1EE3c l\u01B0u",
    description: "Nh\u1EA5n d\u1EA5u l\u01B0u tr\xEAn tin tuy\u1EC3n d\u1EE5ng \u0111\u1EC3 xem l\u1EA1i sau.",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      icon: "search"
    }, "T\xECm vi\u1EC7c")
  }) : list.map(j => /*#__PURE__*/React.createElement(JobCard, _extends({
    key: j.id
  }, j, {
    saved: true,
    onSave: () => toggleSave(j.id),
    footer: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      icon: "send"
    }, "\u1EE8ng tuy\u1EC3n")
  }))));
}
function AppsScreen() {
  const [tab, setTab] = React.useState("all");
  const rows = APPLICATIONS.filter(a => tab === "all" || tab === "waiting" && a.tone === "info" || tab === "interview" && a.tone === "success" || tab === "closed" && a.tone === "danger");
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gap: "var(--space-4)",
      maxWidth: 940
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    items: [{
      value: "all",
      label: "Tất cả",
      count: 3
    }, {
      value: "waiting",
      label: "Chờ phản hồi",
      count: 1
    }, {
      value: "interview",
      label: "Mời phỏng vấn",
      count: 1
    }, {
      value: "closed",
      label: "Đã kết thúc",
      count: 1
    }]
  }), /*#__PURE__*/React.createElement(Card, {
    padding: "none"
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "var(--surface-sunken)"
    }
  }, ["Vị trí", "Công ty", "Ngày gửi", "Trạng thái", ""].map(h => /*#__PURE__*/React.createElement("th", {
    key: h,
    style: {
      textAlign: "left",
      font: "var(--type-meta)",
      color: "var(--text-muted)",
      padding: "var(--space-3) var(--space-4)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-caps)",
      fontSize: "var(--text-2xs)"
    }
  }, h)))), /*#__PURE__*/React.createElement("tbody", null, rows.map(a => /*#__PURE__*/React.createElement("tr", {
    key: a.id,
    style: {
      borderTop: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-4)",
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, a.job.title), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      alignItems: "center",
      gap: "var(--space-2)",
      font: "var(--type-body-sm)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: a.job.company,
    role: "employer",
    size: "xs"
  }), a.job.company)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-4)",
      font: "var(--type-mono)",
      color: "var(--text-muted)"
    }
  }, a.sent), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Badge, {
    tone: a.tone
  }, a.stage)), /*#__PURE__*/React.createElement("td", {
    style: {
      padding: "var(--space-3) var(--space-4)",
      textAlign: "right"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    iconAfter: "chevron-right"
  }, "Chi ti\u1EBFt"))))))));
}
function MessagesScreen() {
  const [active, setActive] = React.useState(THREADS[0].id);
  const [draft, setDraft] = React.useState("");
  const [sent, setSent] = React.useState({});
  const thread = THREADS.find(t => t.id === active);
  const msgs = [...thread.messages, ...(sent[active] || [])];
  const send = () => {
    if (!draft.trim()) return;
    setSent({
      ...sent,
      [active]: [...(sent[active] || []), {
        me: true,
        text: draft,
        time: "Vừa xong"
      }]
    });
    setDraft("");
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      height: "calc(100vh - var(--topbar-h))"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 300,
      flex: "none",
      borderRight: "var(--border-w) solid var(--border-subtle)",
      background: "var(--surface-card)",
      overflow: "auto"
    }
  }, THREADS.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.id,
    onClick: () => setActive(t.id),
    style: {
      display: "flex",
      gap: "var(--space-3)",
      width: "100%",
      textAlign: "left",
      padding: "var(--space-3) var(--space-4)",
      border: "none",
      borderBottom: "var(--border-w) solid var(--border-subtle)",
      background: t.id === active ? "var(--pine-50)" : "transparent",
      cursor: "pointer"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: t.org,
    role: "employer",
    size: "md"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, t.name), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)"
    }
  }, t.time)), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, t.last), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)"
    }
  }, t.org), t.unread ? /*#__PURE__*/React.createElement("span", {
    style: {
      background: "var(--pine-500)",
      color: "#fff",
      font: "var(--type-meta)",
      fontSize: 10,
      borderRadius: "var(--radius-pill)",
      padding: "0 6px"
    }
  }, t.unread) : null))))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "flex",
      flexDirection: "column",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      padding: "var(--space-3) var(--space-5)",
      background: "var(--surface-card)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: thread.org,
    role: "employer",
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, thread.name), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, thread.org, " \xB7 Nh\xE0 tuy\u1EC3n d\u1EE5ng")), /*#__PURE__*/React.createElement(IconButton, {
    icon: "phone",
    label: "G\u1ECDi"
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "ellipsis-vertical",
    label: "T\xF9y ch\u1ECDn"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: "auto",
      padding: "var(--space-5)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)"
    }
  }, msgs.map((m, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      alignSelf: m.me ? "flex-end" : "flex-start",
      maxWidth: 460
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-3) var(--space-4)",
      borderRadius: "var(--radius-xl)",
      borderBottomRightRadius: m.me ? "var(--radius-xs)" : "var(--radius-xl)",
      borderBottomLeftRadius: m.me ? "var(--radius-xl)" : "var(--radius-xs)",
      background: m.me ? "var(--pine-500)" : "var(--surface-card)",
      color: m.me ? "#fff" : "var(--text-body)",
      border: m.me ? "none" : "var(--border-w) solid var(--border-subtle)",
      font: "var(--type-body)"
    }
  }, m.text), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)",
      marginTop: 4,
      textAlign: m.me ? "right" : "left"
    }
  }, m.time)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)",
      padding: "var(--space-3) var(--space-5)",
      background: "var(--surface-card)",
      borderTop: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(IconButton, {
    icon: "paperclip",
    label: "G\u1EEDi t\u1EC7p"
  }), /*#__PURE__*/React.createElement(Input, {
    placeholder: "Nh\u1EADp tin nh\u1EAFn\u2026",
    value: draft,
    onChange: e => setDraft(e.target.value),
    onKeyDown: e => e.key === "Enter" && send(),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    icon: "send",
    onClick: send
  }, "G\u1EEDi"))));
}
function ProfileScreen() {
  const [visible, setVisible] = React.useState(true);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gridTemplateColumns: "1fr 300px",
      gap: "var(--space-6)",
      maxWidth: "var(--layout-max)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "flex",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Nguy\u1EC5n Minh Anh",
    role: "candidate",
    size: "xl"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "grid",
      gap: "var(--space-1)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-h2)"
    }
  }, "Nguy\u1EC5n Minh Anh"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, "Sinh vi\xEAn n\u0103m 3 \xB7 K\u1EF9 thu\u1EADt ph\u1EA7n m\u1EC1m \xB7 \u0110\u1EA1i h\u1ECDc B\xE1ch khoa H\xE0 N\u1ED9i"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-4)",
      font: "var(--type-body-sm)",
      color: "var(--text-muted)",
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 4,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "mail",
    size: 14
  }), "minhanh@sinhvien.hust.edu.vn"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 4,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 14
  }), "H\xE0 N\u1ED9i")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-15)",
      marginTop: "var(--space-2)",
      flexWrap: "wrap"
    }
  }, ["React", "TypeScript", "Figma", "SQL", "Tiếng Anh IELTS 6.5"].map(s => /*#__PURE__*/React.createElement(Badge, {
    key: s
  }, s)))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "pencil",
    size: "sm"
  }, "S\u1EEDa h\u1ED3 s\u01A1")), /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "CV c\u1EE7a b\u1EA1n"), /*#__PURE__*/React.createElement(Card, {
    tone: "sunken",
    padding: "sm",
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-card)",
      color: "var(--pine-600)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "CV_NguyenMinhAnh_2026.pdf"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, "C\u1EADp nh\u1EADt 26/08/2026 \xB7 412 KB")), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "download"
  }, "T\u1EA3i xu\u1ED1ng"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "upload"
  }, "T\u1EA3i CV m\u1EDBi")), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, "Ph\xE2n t\xEDch CV t\u1EF1 \u0111\u1ED9ng s\u1EBD c\xF3 trong b\u1EA3n c\u1EADp nh\u1EADt sau. Hi\u1EC7n t\u1EA1i nh\xE0 tuy\u1EC3n d\u1EE5ng \u0111\u1ECDc tr\u1EF1c ti\u1EBFp t\u1EC7p b\u1EA1n t\u1EA3i l\xEAn.")), /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Kinh nghi\u1EC7m & d\u1EF1 \xE1n"), [["Dự án cuối khóa — Web quản lý thư viện", "09/2025 – 01/2026", "Vai trò Frontend, React + Tailwind, nhóm 4 người."], ["CLB Lập trình HUST", "2024 – nay", "Thành viên ban kỹ thuật, tổ chức 3 workshop cho sinh viên năm nhất."]].map(([t, d, s]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: "grid",
      gap: 2,
      paddingBottom: "var(--space-3)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "space-between",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)"
    }
  }, d)), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, s))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-4)",
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "md",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "M\u1EE9c \u0111\u1ED9 ho\xE0n thi\u1EC7n"), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 8,
      borderRadius: "var(--radius-pill)",
      background: "var(--surface-sunken)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: "80%",
      height: "100%",
      borderRadius: "var(--radius-pill)",
      background: "var(--pine-500)"
    }
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, "80% \u2014 th\xEAm m\xF4 t\u1EA3 d\u1EF1 \xE1n \u0111\u1EC3 t\u0103ng c\u01A1 h\u1ED9i \u0111\u01B0\u1EE3c xem h\u1ED3 s\u01A1.")), /*#__PURE__*/React.createElement(Card, {
    padding: "md",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "Quy\u1EC1n ri\xEAng t\u01B0"), /*#__PURE__*/React.createElement(Switch, {
    label: "Cho nh\xE0 tuy\u1EC3n d\u1EE5ng t\xECm th\u1EA5y h\u1ED3 s\u01A1",
    checked: visible,
    onChange: () => setVisible(!visible)
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "Nh\u1EADn email khi c\xF3 tin ph\xF9 h\u1EE3p",
    checked: true,
    onChange: () => {}
  }))));
}
Object.assign(window, {
  SavedScreen,
  AppsScreen,
  MessagesScreen,
  ProfileScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/candidate_web/CandidateScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/candidate_web/CandidateShell.jsx
try { (() => {
var {
  Icon,
  Avatar,
  Badge,
  Button,
  IconButton,
  Card,
  StatusPill,
  RoleBadge,
  JobCard,
  Tabs,
  SideNav,
  Pagination,
  Input,
  Select,
  Textarea,
  Checkbox,
  Switch,
  EmptyState,
  Toast,
  StatCard
} = window.InternHubDesignSystem_f6cc55;
var JOBS = [{
  id: 1,
  title: "Thực tập sinh Frontend (ReactJS)",
  company: "FPT Software",
  verified: true,
  isNew: true,
  location: "Hà Nội",
  salary: "4 – 6 triệu / tháng",
  deadline: "Còn 12 ngày",
  tags: ["React", "3 tháng", "Hybrid"],
  industry: "Công nghệ thông tin",
  desc: "Tham gia phát triển giao diện cho sản phẩm quản trị nội bộ cùng đội 6 người. Bạn sẽ làm việc trực tiếp với mentor là Senior Frontend Engineer.",
  reqs: ["Sinh viên năm 3 – 4 ngành CNTT hoặc tương đương", "Nắm vững HTML, CSS, JavaScript ES6", "Đã làm ít nhất một dự án với React", "Tiếng Anh đọc hiểu tài liệu kỹ thuật"],
  perks: ["Trợ cấp 4 – 6 triệu / tháng", "Mentor 1:1 hàng tuần", "Xét chuyển chính thức sau 3 tháng"]
}, {
  id: 2,
  title: "Thực tập sinh Digital Marketing",
  company: "Tiki",
  verified: true,
  isNew: true,
  location: "TP. Hồ Chí Minh",
  salary: "3 – 5 triệu / tháng",
  deadline: "Còn 4 ngày",
  tags: ["Content", "6 tháng", "Tại chỗ"],
  industry: "Marketing",
  desc: "Hỗ trợ đội Growth lên kế hoạch nội dung cho các chiến dịch khuyến mãi theo tháng.",
  reqs: ["Sinh viên năm 3 – 4", "Viết tiếng Việt tốt", "Biết dùng Canva hoặc Figma cơ bản"],
  perks: ["Trợ cấp 3 – 5 triệu / tháng", "Được cấp laptop"]
}, {
  id: 3,
  title: "Thực tập sinh Kiểm thử phần mềm",
  company: "VNG Corporation",
  verified: true,
  location: "TP. Hồ Chí Minh",
  salary: "Thỏa thuận",
  deadline: "Còn 20 ngày",
  tags: ["Manual QA", "6 tháng"],
  industry: "Công nghệ thông tin",
  desc: "Viết và thực thi test case cho các tính năng mới của sản phẩm thanh toán.",
  reqs: ["Sinh viên năm 3 – 4", "Cẩn thận, ghi chép rõ ràng"],
  perks: ["Trợ cấp theo năng lực", "Cơ hội ở lại team QA"]
}, {
  id: 4,
  title: "Thực tập sinh Kế toán",
  company: "Công ty TNHH Minh Phát",
  verified: false,
  location: "Đà Nẵng",
  salary: "3 triệu / tháng",
  deadline: "Còn 8 ngày",
  tags: ["Kế toán", "4 tháng"],
  industry: "Kế toán – Kiểm toán",
  desc: "Hỗ trợ đối chiếu chứng từ và nhập liệu sổ sách cùng phòng Kế toán 4 người.",
  reqs: ["Sinh viên năm 3 – 4 ngành Kế toán", "Thành thạo Excel"],
  perks: ["Trợ cấp 3 triệu / tháng", "Xác nhận thực tập theo mẫu của trường"]
}, {
  id: 5,
  title: "Thực tập sinh Nhân sự (Tuyển dụng)",
  company: "Techcombank",
  verified: true,
  location: "Hà Nội",
  salary: "4 triệu / tháng",
  deadline: "Còn 15 ngày",
  tags: ["HR", "6 tháng", "Hybrid"],
  industry: "Nhân sự",
  desc: "Sàng lọc hồ sơ, đặt lịch phỏng vấn và theo dõi dữ liệu ứng viên trên hệ thống.",
  reqs: ["Sinh viên năm 3 – 4", "Giao tiếp tốt", "Cẩn thận với dữ liệu"],
  perks: ["Trợ cấp 4 triệu / tháng", "Đào tạo nghiệp vụ tuyển dụng"]
}];
var APPLICATIONS = [{
  id: 11,
  job: JOBS[0],
  stage: "Chờ phản hồi",
  tone: "info",
  sent: "28/08/2026"
}, {
  id: 12,
  job: JOBS[2],
  stage: "Mời phỏng vấn",
  tone: "success",
  sent: "24/08/2026"
}, {
  id: 13,
  job: JOBS[3],
  stage: "Không phù hợp",
  tone: "danger",
  sent: "18/08/2026"
}];
var THREADS = [{
  id: 21,
  name: "Phạm Thu Trang",
  org: "FPT Software",
  role: "employer",
  last: "Bạn rảnh phỏng vấn thứ Năm 14:00 chứ?",
  time: "10:24",
  unread: 2,
  messages: [{
    me: false,
    text: "Chào bạn, mình đã xem hồ sơ và rất ấn tượng với dự án cuối khóa.",
    time: "10:02"
  }, {
    me: true,
    text: "Cảm ơn chị. Em rất mong được trao đổi thêm về vị trí này.",
    time: "10:15"
  }, {
    me: false,
    text: "Bạn rảnh phỏng vấn thứ Năm 14:00 chứ?",
    time: "10:24"
  }]
}, {
  id: 22,
  name: "Đỗ Quang Huy",
  org: "VNG Corporation",
  role: "employer",
  last: "Mình gửi bạn đề bài nhỏ nhé.",
  time: "Hôm qua",
  unread: 0,
  messages: [{
    me: false,
    text: "Mình gửi bạn đề bài nhỏ nhé.",
    time: "Hôm qua 16:40"
  }]
}];
var NAV = [{
  value: "search",
  label: "Tìm việc",
  icon: "search"
}, {
  value: "saved",
  label: "Tin đã lưu",
  icon: "bookmark",
  count: 2
}, {
  value: "apps",
  label: "Hồ sơ đã gửi",
  icon: "send",
  count: 3
}, {
  section: "Của bạn"
}, {
  value: "messages",
  label: "Tin nhắn",
  icon: "message-square",
  count: 2
}, {
  value: "profile",
  label: "Hồ sơ & CV",
  icon: "file-user"
}];
function TopBar({
  title,
  right
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: "var(--topbar-h)",
      flex: "none",
      display: "flex",
      alignItems: "center",
      gap: "var(--space-4)",
      padding: "0 var(--space-6)",
      background: "var(--surface-card)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h2)",
      fontSize: "var(--text-xl)",
      flex: 1
    }
  }, title), right, /*#__PURE__*/React.createElement(IconButton, {
    icon: "bell",
    label: "Th\xF4ng b\xE1o"
  }), /*#__PURE__*/React.createElement(Avatar, {
    name: "Nguy\u1EC5n Minh Anh",
    size: "sm",
    role: "candidate"
  }));
}
function Logo() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    alt: "",
    style: {
      height: 26
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-wordmark.svg",
    alt: "InternHub",
    style: {
      height: 17
    }
  }));
}
Object.assign(window, {
  IH: window.InternHubDesignSystem_f6cc55,
  JOBS,
  APPLICATIONS,
  THREADS,
  NAV,
  TopBar,
  Logo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/candidate_web/CandidateShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/candidate_web/SearchScreen.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
var {
  Icon,
  Avatar,
  Badge,
  Button,
  IconButton,
  Card,
  JobCard,
  Input,
  Select,
  Checkbox,
  Pagination,
  EmptyState,
  Toast,
  StatusPill
} = window.InternHubDesignSystem_f6cc55;
function FilterPanel({
  filters,
  setFilters
}) {
  const set = (k, v) => setFilters({
    ...filters,
    [k]: v
  });
  return /*#__PURE__*/React.createElement(Card, {
    padding: "md",
    style: {
      width: 244,
      flex: "none",
      alignSelf: "flex-start",
      display: "grid",
      gap: "var(--space-4)",
      position: "sticky",
      top: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "B\u1ED9 l\u1ECDc"), /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    style: {
      font: "var(--type-body-sm)"
    },
    onClick: () => setFilters({
      industry: "Tất cả ngành",
      city: "Tất cả khu vực",
      salary: "Mọi mức lương",
      remote: false,
      verified: true
    })
  }, "\u0110\u1EB7t l\u1EA1i")), /*#__PURE__*/React.createElement(Select, {
    label: "Ng\xE0nh",
    size: "sm",
    value: filters.industry,
    onChange: e => set("industry", e.target.value),
    options: ["Tất cả ngành", "Công nghệ thông tin", "Marketing", "Kế toán – Kiểm toán", "Nhân sự"]
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Khu v\u1EF1c",
    size: "sm",
    value: filters.city,
    onChange: e => set("city", e.target.value),
    options: ["Tất cả khu vực", "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"]
  }), /*#__PURE__*/React.createElement(Select, {
    label: "M\u1EE9c l\u01B0\u01A1ng",
    size: "sm",
    value: filters.salary,
    onChange: e => set("salary", e.target.value),
    options: ["Mọi mức lương", "Từ 3 triệu", "Từ 5 triệu", "Thỏa thuận"]
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-2)",
      paddingTop: "var(--space-1)",
      borderTop: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Checkbox, {
    label: "C\xF3 h\u1ED7 tr\u1EE3 remote",
    checked: filters.remote,
    onChange: () => set("remote", !filters.remote)
  }), /*#__PURE__*/React.createElement(Checkbox, {
    label: "Ch\u1EC9 c\xF4ng ty \u0111\xE3 x\xE1c th\u1EF1c",
    checked: filters.verified,
    onChange: () => set("verified", !filters.verified)
  })));
}
function JobDetail({
  job,
  saved,
  onSave,
  onApply,
  onClose
}) {
  return /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: job.company,
    role: "employer",
    size: "xl"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "grid",
      gap: "var(--space-15)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-start",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-h1)",
      flex: 1
    }
  }, job.title), /*#__PURE__*/React.createElement(IconButton, {
    icon: "x",
    label: "\u0110\xF3ng",
    onClick: onClose
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, job.company, job.verified ? /*#__PURE__*/React.createElement(Badge, {
    tone: "brand",
    icon: "badge-check"
  }, "\u0110\xE3 x\xE1c th\u1EF1c") : /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    icon: "clock"
  }, "Ch\u1EDD x\xE1c th\u1EF1c")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      gap: "var(--space-4)",
      font: "var(--type-body-sm)",
      color: "var(--text-muted)",
      marginTop: "var(--space-1)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 4,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "map-pin",
    size: 14
  }), job.location), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 4,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "wallet",
    size: 14
  }), job.salary), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 4,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar-clock",
    size: 14
  }), job.deadline)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      flexWrap: "wrap",
      minWidth: 0,
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "send",
    onClick: onApply
  }, "\u1EE8ng tuy\u1EC3n ngay"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "bookmark",
    onClick: onSave
  }, saved ? "Đã lưu" : "Lưu tin"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    icon: "message-square"
  }, "Nh\u1EAFn tin")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-4)",
      borderTop: "var(--border-w) solid var(--border-subtle)",
      paddingTop: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement("section", {
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "M\xF4 t\u1EA3 c\xF4ng vi\u1EC7c"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      maxWidth: "var(--layout-prose)"
    }
  }, job.desc)), /*#__PURE__*/React.createElement("section", {
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Y\xEAu c\u1EA7u"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: "var(--space-5)",
      font: "var(--type-body)",
      display: "grid",
      gap: "var(--space-1)"
    }
  }, job.reqs.map(r => /*#__PURE__*/React.createElement("li", {
    key: r
  }, r)))), /*#__PURE__*/React.createElement("section", {
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Quy\u1EC1n l\u1EE3i"), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: "var(--space-5)",
      font: "var(--type-body)",
      display: "grid",
      gap: "var(--space-1)"
    }
  }, job.perks.map(r => /*#__PURE__*/React.createElement("li", {
    key: r
  }, r))))));
}
function ApplyDialog({
  job,
  onClose,
  onSend
}) {
  const [note, setNote] = React.useState("");
  return /*#__PURE__*/React.createElement("div", {
    onClick: onClose,
    style: {
      position: "fixed",
      inset: 0,
      background: "var(--surface-overlay)",
      backdropFilter: "var(--blur-overlay)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement(Card, {
    onClick: e => e.stopPropagation(),
    padding: "lg",
    style: {
      width: 520,
      borderRadius: "var(--radius-xl)",
      boxShadow: "var(--shadow-xl)",
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h2)"
    }
  }, "\u1EE8ng tuy\u1EC3n v\u1ECB tr\xED n\xE0y"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)",
      marginTop: 4
    }
  }, job.title, " \xB7 ", job.company)), /*#__PURE__*/React.createElement(Card, {
    tone: "sunken",
    padding: "sm",
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 34,
      height: 34,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-card)",
      color: "var(--pine-600)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 18
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "CV_NguyenMinhAnh_2026.pdf"), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, "C\u1EADp nh\u1EADt 26/08/2026 \xB7 412 KB")), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "\u0110\u1ED5i CV")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-15)"
    }
  }, /*#__PURE__*/React.createElement("label", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "Th\u01B0 gi\u1EDBi thi\u1EC7u (kh\xF4ng b\u1EAFt bu\u1ED9c)"), /*#__PURE__*/React.createElement("textarea", {
    rows: 4,
    value: note,
    onChange: e => setNote(e.target.value),
    placeholder: "V\xEC sao b\u1EA1n ph\xF9 h\u1EE3p v\u1EDBi v\u1ECB tr\xED n\xE0y?",
    style: {
      width: "100%",
      padding: "var(--space-3)",
      font: "var(--type-body)",
      color: "var(--text-strong)",
      border: "var(--border-w) solid var(--border-default)",
      borderRadius: "var(--radius-md)",
      resize: "vertical"
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: onClose
  }, "H\u1EE7y"), /*#__PURE__*/React.createElement(Button, {
    icon: "send",
    onClick: onSend
  }, "G\u1EEDi h\u1ED3 s\u01A1"))));
}
function SearchScreen({
  savedIds,
  toggleSave,
  onApplied
}) {
  const [filters, setFilters] = React.useState({
    industry: "Tất cả ngành",
    city: "Tất cả khu vực",
    salary: "Mọi mức lương",
    remote: false,
    verified: true
  });
  const [q, setQ] = React.useState("");
  const [openId, setOpenId] = React.useState(1);
  const [applying, setApplying] = React.useState(null);
  const [page, setPage] = React.useState(1);
  const list = JOBS.filter(j => (filters.industry === "Tất cả ngành" || j.industry === filters.industry) && (filters.city === "Tất cả khu vực" || j.location === filters.city) && (!filters.verified || j.verified) && (q.trim() === "" || (j.title + j.company).toLowerCase().includes(q.toLowerCase())));
  const open = list.find(j => j.id === openId);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-6)",
      padding: "var(--space-6)",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement(FilterPanel, {
    filters: filters,
    setFilters: setFilters
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "sm",
    style: {
      display: "flex",
      gap: "var(--space-2)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: "T\xECm v\u1ECB tr\xED, c\xF4ng ty, k\u1EF9 n\u0103ng\u2026",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Select, {
    size: "md",
    options: [{
      value: "new",
      label: "Mới nhất"
    }, {
      value: "salary",
      label: "Lương cao nhất"
    }, {
      value: "deadline",
      label: "Sắp hết hạn"
    }],
    style: {
      width: 170
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, list.length, " tin ph\xF9 h\u1EE3p \xB7 c\u1EADp nh\u1EADt h\xF4m nay")), list.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    icon: "search-x",
    title: "Kh\xF4ng t\xECm th\u1EA5y tin ph\xF9 h\u1EE3p",
    description: "Th\u1EED b\u1ECF b\u1ED9 l\u1ECDc m\u1EE9c l\u01B0\u01A1ng ho\u1EB7c m\u1EDF r\u1ED9ng khu v\u1EF1c.",
    action: /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      onClick: () => {
        setQ("");
        setFilters({
          ...filters,
          industry: "Tất cả ngành",
          city: "Tất cả khu vực",
          verified: false
        });
      }
    }, "X\xF3a b\u1ED9 l\u1ECDc")
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, list.map(j => /*#__PURE__*/React.createElement(JobCard, _extends({
    key: j.id
  }, j, {
    selected: j.id === openId,
    saved: savedIds.includes(j.id),
    onSave: () => toggleSave(j.id),
    onClick: () => setOpenId(j.id)
  })))), /*#__PURE__*/React.createElement(Pagination, {
    page: page,
    total: 5,
    onChange: setPage,
    summary: `1–${list.length} trong 248 tin`
  })), open ? /*#__PURE__*/React.createElement("div", {
    style: {
      width: 460,
      flex: "none"
    }
  }, /*#__PURE__*/React.createElement(JobDetail, {
    job: open,
    saved: savedIds.includes(open.id),
    onSave: () => toggleSave(open.id),
    onApply: () => setApplying(open),
    onClose: () => setOpenId(null)
  })) : null, applying ? /*#__PURE__*/React.createElement(ApplyDialog, {
    job: applying,
    onClose: () => setApplying(null),
    onSend: () => {
      setApplying(null);
      onApplied(applying);
    }
  }) : null);
}
Object.assign(window, {
  SearchScreen,
  JobDetail,
  ApplyDialog,
  FilterPanel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/candidate_web/SearchScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/employer_portal/EmployerShell.jsx
try { (() => {
var {
  Icon,
  Avatar,
  Badge,
  Button,
  IconButton,
  Card,
  StatusPill,
  StatCard,
  Tabs,
  Input,
  Select,
  Textarea,
  Checkbox,
  Switch,
  EmptyState,
  Toast,
  JobCard,
  Pagination
} = window.InternHubDesignSystem_f6cc55;
var POSTS = [{
  id: 101,
  title: "Thực tập sinh Frontend (ReactJS)",
  status: "published",
  location: "Hà Nội",
  salary: "4 – 6 triệu / tháng",
  deadline: "Còn 12 ngày",
  views: 1284,
  apps: 26,
  updated: "01/09/2026"
}, {
  id: 102,
  title: "Thực tập sinh Kiểm thử phần mềm",
  status: "review",
  location: "Hà Nội",
  salary: "Thỏa thuận",
  deadline: "Hạn 30/09/2026",
  views: 0,
  apps: 0,
  updated: "02/09/2026"
}, {
  id: 103,
  title: "Thực tập sinh Phân tích dữ liệu",
  status: "draft",
  location: "Đà Nẵng",
  salary: "5 triệu / tháng",
  deadline: "Chưa đặt hạn",
  views: 0,
  apps: 0,
  updated: "31/08/2026"
}, {
  id: 104,
  title: "Thực tập sinh DevOps",
  status: "published",
  location: "TP. Hồ Chí Minh",
  salary: "6 – 8 triệu / tháng",
  deadline: "Còn 3 ngày",
  views: 842,
  apps: 14,
  updated: "28/08/2026"
}, {
  id: 105,
  title: "Thực tập sinh Business Analyst",
  status: "expired",
  location: "Hà Nội",
  salary: "4 triệu / tháng",
  deadline: "Hết hạn 20/08/2026",
  views: 2103,
  apps: 41,
  updated: "20/08/2026"
}, {
  id: 106,
  title: "Thực tập sinh Thiết kế UI",
  status: "takendown",
  location: "Hà Nội",
  salary: "Thỏa thuận",
  deadline: "Đã hạ 15/08/2026",
  views: 311,
  apps: 5,
  updated: "15/08/2026"
}];
var CANDIDATES = [{
  id: 201,
  name: "Nguyễn Minh Anh",
  school: "ĐH Bách khoa Hà Nội",
  year: "Năm 3",
  stage: "new",
  skills: ["React", "TypeScript"],
  sent: "28/08",
  cv: "CV_NguyenMinhAnh_2026.pdf"
}, {
  id: 202,
  name: "Trần Quốc Bảo",
  school: "ĐH Công nghệ – ĐHQGHN",
  year: "Năm 4",
  stage: "new",
  skills: ["Vue", "Node"],
  sent: "27/08",
  cv: "CV_TranQuocBao.pdf"
}, {
  id: 203,
  name: "Lê Thu Hà",
  school: "ĐH Kinh tế Quốc dân",
  year: "Năm 3",
  stage: "shortlist",
  skills: ["React", "Figma"],
  sent: "26/08",
  cv: "CV_LeThuHa.pdf"
}, {
  id: 204,
  name: "Phạm Gia Khánh",
  school: "ĐH Bách khoa Đà Nẵng",
  year: "Năm 4",
  stage: "interview",
  skills: ["React", "SQL"],
  sent: "24/08",
  cv: "CV_PhamGiaKhanh.pdf"
}, {
  id: 205,
  name: "Vũ Hoàng Nam",
  school: "ĐH FPT",
  year: "Năm 3",
  stage: "reject",
  skills: ["Angular"],
  sent: "22/08",
  cv: "CV_VuHoangNam.pdf"
}];
var E_NAV = [{
  value: "dash",
  label: "Tổng quan",
  icon: "layout-dashboard"
}, {
  section: "Tuyển dụng"
}, {
  value: "jobs",
  label: "Tin tuyển dụng",
  icon: "briefcase",
  count: 6
}, {
  value: "cands",
  label: "Ứng viên",
  icon: "users",
  count: 5
}, {
  value: "messages",
  label: "Tin nhắn",
  icon: "message-square",
  count: 3
}, {
  section: "Công ty"
}, {
  value: "company",
  label: "Hồ sơ công ty",
  icon: "building-2"
}, {
  value: "team",
  label: "Thành viên",
  icon: "user-plus"
}];
function ETopBar({
  title,
  right
}) {
  return /*#__PURE__*/React.createElement("header", {
    style: {
      height: "var(--topbar-h)",
      flex: "none",
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      padding: "0 var(--space-6)",
      background: "var(--surface-card)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h2)",
      fontSize: "var(--text-xl)",
      flex: 1
    }
  }, title), right, /*#__PURE__*/React.createElement(IconButton, {
    icon: "bell",
    label: "Th\xF4ng b\xE1o"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      paddingLeft: "var(--space-3)",
      borderLeft: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Ph\u1EA1m Thu Trang",
    role: "employer",
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "Ph\u1EA1m Thu Trang"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-muted)"
    }
  }, "HR \xB7 FPT Software"))));
}
function ELogo() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    alt: "",
    style: {
      height: 24
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-wordmark.svg",
    alt: "InternHub",
    style: {
      height: 15
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)",
      padding: "var(--space-2)",
      borderRadius: "var(--radius-md)",
      background: "var(--role-employer-soft)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "FPT Software",
    role: "employer",
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--role-employer-ink)",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    }
  }, "FPT Software"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--role-employer)"
    }
  }, "\u0110\xE3 x\xE1c th\u1EF1c"))));
}
Object.assign(window, {
  POSTS,
  CANDIDATES,
  E_NAV,
  ETopBar,
  ELogo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/employer_portal/EmployerShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/employer_portal/JobScreens.jsx
try { (() => {
var {
  Icon,
  Avatar,
  Badge,
  Button,
  IconButton,
  Card,
  StatusPill,
  StatCard,
  Tabs,
  Input,
  Select,
  Textarea,
  Checkbox,
  Switch,
  EmptyState,
  Toast,
  Pagination
} = window.InternHubDesignSystem_f6cc55;
function DashScreen({
  go
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gap: "var(--space-5)",
      maxWidth: "var(--layout-max)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4, 1fr)",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    icon: "briefcase",
    label: "Tin \u0111ang hi\u1EC3n th\u1ECB",
    value: 2,
    unit: "tin"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "clock",
    label: "Ch\u1EDD duy\u1EC7t",
    value: 1,
    unit: "tin",
    hint: "Admin th\u01B0\u1EDDng duy\u1EC7t trong 1 ng\xE0y"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "users",
    label: "H\u1ED3 s\u01A1 m\u1EDBi",
    value: 26,
    delta: "+8",
    deltaTone: "up",
    hint: "tu\u1EA7n n\xE0y"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "eye",
    label: "L\u01B0\u1EE3t xem tin",
    value: "2.126",
    delta: "-4%",
    deltaTone: "down",
    hint: "so v\u1EDBi tu\u1EA7n tr\u01B0\u1EDBc"
  })), /*#__PURE__*/React.createElement(Toast, {
    inline: true,
    tone: "warning",
    title: "Tin \u201CTh\u1EF1c t\u1EADp sinh DevOps\u201D s\u1EAFp h\u1EBFt h\u1EA1n",
    description: "C\xF2n 3 ng\xE0y. Gia h\u1EA1n \u0111\u1EC3 ti\u1EBFp t\u1EE5c nh\u1EADn h\u1ED3 s\u01A1.",
    action: /*#__PURE__*/React.createElement(Button, {
      size: "sm",
      variant: "secondary"
    }, "Gia h\u1EA1n tin")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1.4fr 1fr",
      gap: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("h3", {
    style: {
      flex: 1
    }
  }, "H\u1ED3 s\u01A1 m\u1EDBi nh\u1EA5t"), /*#__PURE__*/React.createElement(Button, {
    variant: "link",
    onClick: () => go("cands")
  }, "Xem t\u1EA5t c\u1EA3")), CANDIDATES.slice(0, 4).map(c => /*#__PURE__*/React.createElement("div", {
    key: c.id,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      paddingBottom: "var(--space-3)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: c.name,
    role: "candidate",
    size: "md"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, c.name), /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, c.school, " \xB7 ", c.year)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-15)"
    }
  }, c.skills.map(s => /*#__PURE__*/React.createElement(Badge, {
    key: s
  }, s))), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)",
      width: 44,
      textAlign: "right"
    }
  }, c.sent), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary"
  }, "Xem CV")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-4)",
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Vi\u1EC7c c\u1EA7n l\xE0m"), [["Duyệt 5 hồ sơ mới", "users", "cands"], ["1 tin đang chờ Admin duyệt", "clock", "jobs"], ["3 tin nhắn chưa trả lời", "message-square", "messages"]].map(([t, i, v]) => /*#__PURE__*/React.createElement("button", {
    key: t,
    onClick: () => go(v),
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)",
      background: "none",
      border: "none",
      padding: "var(--space-2) 0",
      cursor: "pointer",
      textAlign: "left",
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-sm)",
      background: "var(--role-employer-soft)",
      color: "var(--role-employer)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: i,
    size: 16
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, t), /*#__PURE__*/React.createElement(Icon, {
    name: "chevron-right",
    size: 16,
    style: {
      color: "var(--text-subtle)"
    }
  })))), /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    tone: "brand",
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--pine-800)"
    }
  }, "\u0110\u0103ng tin m\u1EDBi"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--pine-700)"
    }
  }, "Tin c\u1EE7a c\xF4ng ty \u0111\xE3 x\xE1c th\u1EF1c \u0111\u01B0\u1EE3c hi\u1EC3n th\u1ECB ngay sau khi Admin duy\u1EC7t."), /*#__PURE__*/React.createElement(Button, {
    icon: "plus",
    onClick: () => go("new"),
    style: {
      justifySelf: "start"
    }
  }, "T\u1EA1o tin tuy\u1EC3n d\u1EE5ng")))));
}
function JobsScreen({
  go,
  onAction
}) {
  const [tab, setTab] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const counts = POSTS.reduce((a, p) => ({
    ...a,
    [p.status]: (a[p.status] || 0) + 1
  }), {});
  const rows = POSTS.filter(p => tab === "all" || p.status === tab);
  const th = {
    textAlign: "left",
    font: "var(--type-meta)",
    fontSize: "var(--text-2xs)",
    textTransform: "uppercase",
    letterSpacing: "var(--tracking-caps)",
    color: "var(--text-muted)",
    padding: "var(--space-3) var(--space-4)"
  };
  const td = {
    padding: "var(--space-3) var(--space-4)",
    font: "var(--type-body-sm)",
    color: "var(--text-body)",
    verticalAlign: "middle"
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gap: "var(--space-4)",
      maxWidth: "var(--layout-max)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Tabs, {
    style: {
      flex: 1
    },
    value: tab,
    onChange: setTab,
    items: [{
      value: "all",
      label: "Tất cả",
      count: POSTS.length
    }, {
      value: "draft",
      label: "Nháp",
      count: counts.draft || 0
    }, {
      value: "review",
      label: "Chờ duyệt",
      count: counts.review || 0
    }, {
      value: "published",
      label: "Đang hiển thị",
      count: counts.published || 0
    }, {
      value: "expired",
      label: "Hết hạn",
      count: counts.expired || 0
    }, {
      value: "takendown",
      label: "Đã hạ",
      count: counts.takendown || 0
    }]
  }), /*#__PURE__*/React.createElement(Button, {
    icon: "plus",
    onClick: () => go("new")
  }, "T\u1EA1o tin")), /*#__PURE__*/React.createElement(Card, {
    padding: "none",
    style: {
      overflow: "hidden"
    }
  }, /*#__PURE__*/React.createElement("table", {
    style: {
      width: "100%",
      borderCollapse: "collapse"
    }
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    style: {
      background: "var(--surface-sunken)"
    }
  }, /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      width: 34
    }
  }, /*#__PURE__*/React.createElement(Checkbox, null)), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "V\u1ECB tr\xED"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Tr\u1EA1ng th\xE1i"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "Khu v\u1EF1c"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "H\u1EA1n"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      textAlign: "right"
    }
  }, "L\u01B0\u1EE3t xem"), /*#__PURE__*/React.createElement("th", {
    style: {
      ...th,
      textAlign: "right"
    }
  }, "H\u1ED3 s\u01A1"), /*#__PURE__*/React.createElement("th", {
    style: th
  }, "C\u1EADp nh\u1EADt"), /*#__PURE__*/React.createElement("th", {
    style: th
  }))), /*#__PURE__*/React.createElement("tbody", null, rows.map(p => /*#__PURE__*/React.createElement("tr", {
    key: p.id,
    style: {
      borderTop: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("td", {
    style: td
  }, /*#__PURE__*/React.createElement(Checkbox, null)), /*#__PURE__*/React.createElement("td", {
    style: {
      ...td,
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, p.title, /*#__PURE__*/React.createElement("div", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)"
    }
  }, "JOB-2026-", p.id)), /*#__PURE__*/React.createElement("td", {
    style: td
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: p.status,
    size: "sm"
  })), /*#__PURE__*/React.createElement("td", {
    style: td
  }, p.location), /*#__PURE__*/React.createElement("td", {
    style: td
  }, p.deadline), /*#__PURE__*/React.createElement("td", {
    style: {
      ...td,
      textAlign: "right",
      fontFamily: "var(--font-mono)",
      fontVariantNumeric: "tabular-nums"
    }
  }, p.views.toLocaleString("vi-VN")), /*#__PURE__*/React.createElement("td", {
    style: {
      ...td,
      textAlign: "right",
      fontFamily: "var(--font-mono)"
    }
  }, p.apps), /*#__PURE__*/React.createElement("td", {
    style: {
      ...td,
      color: "var(--text-muted)"
    }
  }, p.updated), /*#__PURE__*/React.createElement("td", {
    style: {
      ...td,
      textAlign: "right",
      whiteSpace: "nowrap"
    }
  }, p.status === "draft" ? /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    onClick: () => onAction("Đã gửi tin để Admin duyệt.", "success")
  }, "G\u1EEDi duy\u1EC7t") : null, p.status === "published" ? /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: () => onAction("Đã đóng tin. Tin không còn nhận hồ sơ.", "info")
  }, "\u0110\xF3ng tin") : null, p.status === "expired" ? /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    onClick: () => onAction("Đã gia hạn tin thêm 30 ngày.", "success")
  }, "Gia h\u1EA1n") : null, /*#__PURE__*/React.createElement(IconButton, {
    icon: "ellipsis-vertical",
    label: "T\xF9y ch\u1ECDn",
    size: "sm",
    style: {
      marginLeft: 4
    }
  }))))))), /*#__PURE__*/React.createElement(Pagination, {
    page: page,
    total: 3,
    onChange: setPage,
    summary: `1–${rows.length} trong ${POSTS.length} tin`
  }));
}
function NewJobScreen({
  onAction,
  go
}) {
  const [f, setF] = React.useState({
    title: "",
    city: "Hà Nội",
    industry: "Công nghệ thông tin",
    salaryFrom: "",
    salaryTo: "",
    desc: "",
    months: "3 tháng",
    remote: false
  });
  const set = k => e => setF({
    ...f,
    [k]: e.target.value
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) 320px",
      gap: "var(--space-6)",
      maxWidth: "var(--layout-max)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Th\xF4ng tin v\u1ECB tr\xED"), /*#__PURE__*/React.createElement(Input, {
    label: "T\xEAn v\u1ECB tr\xED",
    required: true,
    placeholder: "V\xED d\u1EE5: Th\u1EF1c t\u1EADp sinh Frontend (ReactJS)",
    value: f.title,
    onChange: set("title")
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Select, {
    label: "Ng\xE0nh",
    value: f.industry,
    onChange: set("industry"),
    options: ["Công nghệ thông tin", "Marketing", "Kế toán – Kiểm toán", "Nhân sự"]
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Khu v\u1EF1c",
    value: f.city,
    onChange: set("city"),
    options: ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"]
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "L\u01B0\u01A1ng t\u1EEB (\u20AB)",
    placeholder: "4.000.000",
    value: f.salaryFrom,
    onChange: set("salaryFrom")
  }), /*#__PURE__*/React.createElement(Input, {
    label: "L\u01B0\u01A1ng \u0111\u1EBFn (\u20AB)",
    placeholder: "6.000.000",
    value: f.salaryTo,
    onChange: set("salaryTo")
  }), /*#__PURE__*/React.createElement(Select, {
    label: "Th\u1EDDi gian th\u1EF1c t\u1EADp",
    value: f.months,
    onChange: set("months"),
    options: ["3 tháng", "4 tháng", "6 tháng"]
  })), /*#__PURE__*/React.createElement(Checkbox, {
    label: "C\xF3 h\u1ED7 tr\u1EE3 l\xE0m vi\u1EC7c remote",
    checked: f.remote,
    onChange: () => setF({
      ...f,
      remote: !f.remote
    })
  })), /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "N\u1ED9i dung tin"), /*#__PURE__*/React.createElement(Textarea, {
    label: "M\xF4 t\u1EA3 c\xF4ng vi\u1EC7c",
    rows: 5,
    maxLength: 2000,
    value: f.desc,
    onChange: set("desc"),
    hint: "N\xEAu r\xF5 c\xF4ng vi\u1EC7c h\u1EB1ng ng\xE0y v\xE0 ng\u01B0\u1EDDi h\u01B0\u1EDBng d\u1EABn."
  }), /*#__PURE__*/React.createElement(Textarea, {
    label: "Y\xEAu c\u1EA7u \u1EE9ng vi\xEAn",
    rows: 4,
    maxLength: 1200,
    value: "",
    onChange: () => {}
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "send",
    onClick: () => {
      onAction("Đã gửi tin để Admin duyệt.", "success");
      go("jobs");
    }
  }, "G\u1EEDi duy\u1EC7t"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "save",
    onClick: () => {
      onAction("Đã lưu bản nháp.", "info");
      go("jobs");
    }
  }, "L\u01B0u nh\xE1p"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: () => go("jobs")
  }, "H\u1EE7y"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-4)",
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "md",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "Quy tr\xECnh duy\u1EC7t"), [["Nháp", "Bạn đang ở đây", "draft"], ["Chờ duyệt", "Admin kiểm tra nội dung", "review"], ["Đang hiển thị", "Sinh viên thấy tin", "published"]].map(([t, s, st], i) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: "flex",
      gap: "var(--space-3)",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 22,
      height: 22,
      flex: "none",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-pill)",
      background: i === 0 ? "var(--pine-500)" : "var(--surface-sunken)",
      color: i === 0 ? "#fff" : "var(--text-muted)",
      font: "var(--type-meta)"
    }
  }, i + 1), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement(StatusPill, {
    status: st,
    size: "sm"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, s))))), /*#__PURE__*/React.createElement(Card, {
    padding: "md",
    tone: "warning",
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--marigold-600)"
    }
  }, "Tr\u01B0\u1EDBc khi g\u1EEDi duy\u1EC7t"), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-body)"
    }
  }, "Tin thi\u1EBFu m\u1EE9c l\u01B0\u01A1ng ho\u1EB7c th\u1EDDi h\u1EA1n \u1EE9ng tuy\u1EC3n s\u1EBD b\u1ECB Admin tr\u1EA3 l\u1EA1i."))));
}
Object.assign(window, {
  DashScreen,
  JobsScreen,
  NewJobScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/employer_portal/JobScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/employer_portal/PeopleScreens.jsx
try { (() => {
var {
  Icon,
  Avatar,
  Badge,
  Button,
  IconButton,
  Card,
  Tabs,
  Input,
  Select,
  Textarea,
  Checkbox,
  Switch,
  EmptyState,
  Toast,
  StatusPill
} = window.InternHubDesignSystem_f6cc55;
var STAGES = [{
  value: "new",
  label: "Hồ sơ mới",
  icon: "inbox"
}, {
  value: "shortlist",
  label: "Vào vòng trong",
  icon: "list-check"
}, {
  value: "interview",
  label: "Phỏng vấn",
  icon: "calendar-check"
}, {
  value: "reject",
  label: "Từ chối",
  icon: "x"
}];
function CandidatesScreen({
  onAction
}) {
  const [stage, setStage] = React.useState("new");
  const [openId, setOpenId] = React.useState(201);
  const [moved, setMoved] = React.useState({});
  const stageOf = c => moved[c.id] || c.stage;
  const rows = CANDIDATES.filter(c => stageOf(c) === stage);
  const open = CANDIDATES.find(c => c.id === openId);
  const counts = v => CANDIDATES.filter(c => stageOf(c) === v).length;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-6)",
      padding: "var(--space-6)",
      alignItems: "flex-start",
      maxWidth: "var(--layout-max)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "sm",
    style: {
      display: "flex",
      gap: "var(--space-2)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Select, {
    size: "md",
    options: ["Thực tập sinh Frontend (ReactJS)", "Thực tập sinh DevOps"],
    style: {
      width: 300
    }
  }), /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: "T\xECm theo t\xEAn, tr\u01B0\u1EDDng, k\u1EF9 n\u0103ng\u2026",
    style: {
      flex: 1
    }
  })), /*#__PURE__*/React.createElement(Tabs, {
    value: stage,
    onChange: setStage,
    items: STAGES.map(s => ({
      ...s,
      count: counts(s.value)
    }))
  }), rows.length === 0 ? /*#__PURE__*/React.createElement(EmptyState, {
    compact: true,
    icon: "inbox",
    title: "Ch\u01B0a c\xF3 h\u1ED3 s\u01A1 \u1EDF b\u01B0\u1EDBc n\xE0y",
    description: "H\u1ED3 s\u01A1 b\u1EA1n chuy\u1EC3n sang b\u01B0\u1EDBc n\xE0y s\u1EBD xu\u1EA5t hi\u1EC7n \u1EDF \u0111\xE2y."
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, rows.map(c => /*#__PURE__*/React.createElement(Card, {
    key: c.id,
    interactive: true,
    selected: c.id === openId,
    onClick: () => setOpenId(c.id),
    padding: "md",
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: c.name,
    role: "candidate",
    size: "lg"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0,
      display: "grid",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-strong)"
    }
  }, c.name), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, c.school, " \xB7 ", c.year), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-15)",
      marginTop: 4
    }
  }, c.skills.map(s => /*#__PURE__*/React.createElement(Badge, {
    key: s
  }, s)))), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-subtle)"
    }
  }, "G\u1EEDi ", c.sent), /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    icon: "file-text"
  }, "Xem CV"))))), open ? /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      width: 400,
      flex: "none",
      display: "grid",
      gap: "var(--space-4)",
      position: "sticky",
      top: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-3)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: open.name,
    role: "candidate",
    size: "xl"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: 2
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-h2)",
      fontSize: "var(--text-xl)",
      color: "var(--text-strong)"
    }
  }, open.name), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, open.school), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, open.year, " \xB7 G\u1EEDi h\u1ED3 s\u01A1 ", open.sent))), /*#__PURE__*/React.createElement(Card, {
    tone: "sunken",
    padding: "sm",
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "var(--radius-sm)",
      background: "var(--surface-card)",
      color: "var(--pine-600)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 17
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      font: "var(--type-body-sm)",
      color: "var(--text-strong)"
    }
  }, open.cv), /*#__PURE__*/React.createElement(IconButton, {
    icon: "download",
    label: "T\u1EA3i CV",
    size: "sm"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "K\u1EF9 n\u0103ng khai b\xE1o"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-15)",
      flexWrap: "wrap"
    }
  }, open.skills.map(s => /*#__PURE__*/React.createElement(Badge, {
    key: s,
    tone: "brand"
  }, s))), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, "\u0110\xE1nh gi\xE1 m\u1EE9c \u0111\u1ED9 ph\xF9 h\u1EE3p t\u1EF1 \u0111\u1ED9ng ch\u01B0a c\xF3 trong phi\xEAn b\u1EA3n n\xE0y \u2014 h\xE3y \u0111\u1ECDc CV tr\u01B0\u1EDBc khi quy\u1EBFt \u0111\u1ECBnh.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-2)",
      borderTop: "var(--border-w) solid var(--border-subtle)",
      paddingTop: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "list-check",
    onClick: () => {
      setMoved({
        ...moved,
        [open.id]: "shortlist"
      });
      onAction("Đã chuyển " + open.name + " vào vòng trong.", "success");
    }
  }, "Chuy\u1EC3n v\xE0o v\xF2ng trong"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "calendar-plus",
    onClick: () => {
      setMoved({
        ...moved,
        [open.id]: "interview"
      });
      onAction("Đã tạo lịch phỏng vấn.", "info");
    }
  }, "M\u1EDDi ph\u1ECFng v\u1EA5n"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    icon: "message-square"
  }, "Nh\u1EAFn tin cho \u1EE9ng vi\xEAn"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    icon: "x",
    onClick: () => {
      setMoved({
        ...moved,
        [open.id]: "reject"
      });
      onAction("Đã gửi thư từ chối lịch sự tới ứng viên.", "info");
    }
  }, "T\u1EEB ch\u1ED1i h\u1ED3 s\u01A1"))) : null);
}
function CompanyScreen({
  onAction
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      padding: "var(--space-6)",
      display: "grid",
      gridTemplateColumns: "minmax(0,1fr) 320px",
      gap: "var(--space-6)",
      maxWidth: "var(--layout-max)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "flex",
      gap: "var(--space-4)",
      alignItems: "flex-start"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "FPT Software",
    role: "employer",
    size: "xl"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "grid",
      gap: "var(--space-1)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-h2)"
    }
  }, "FPT Software"), /*#__PURE__*/React.createElement(Badge, {
    tone: "brand",
    icon: "badge-check"
  }, "\u0110\xE3 x\xE1c th\u1EF1c")), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, "C\xF4ng ngh\u1EC7 th\xF4ng tin \xB7 1.000+ nh\xE2n vi\xEAn \xB7 fpt-software.com")), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "pencil"
  }, "S\u1EEDa")), /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("h3", null, "Th\xF4ng tin doanh nghi\u1EC7p"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "T\xEAn c\xF4ng ty",
    defaultValue: "FPT Software"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "M\xE3 s\u1ED1 thu\u1EBF",
    defaultValue: "0101248141",
    hint: "D\xF9ng \u0111\u1EC3 Admin x\xE1c th\u1EF1c doanh nghi\u1EC7p."
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Ng\u01B0\u1EDDi li\xEAn h\u1EC7",
    defaultValue: "Ph\u1EA1m Thu Trang"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "Email c\xF4ng vi\u1EC7c",
    defaultValue: "trang.pham@fpt-software.com",
    icon: "mail"
  })), /*#__PURE__*/React.createElement(Textarea, {
    label: "Gi\u1EDBi thi\u1EC7u c\xF4ng ty",
    rows: 4,
    maxLength: 800,
    value: "C\xF4ng ty ph\u1EA7n m\u1EC1m v\u1EDBi h\u01A1n 30.000 nh\xE2n s\u1EF1, nh\u1EADn th\u1EF1c t\u1EADp sinh theo k\u1EF3 t\u1EA1i H\xE0 N\u1ED9i, \u0110\xE0 N\u1EB5ng v\xE0 TP. H\u1ED3 Ch\xED Minh.",
    onChange: () => {}
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    icon: "save",
    onClick: () => onAction("Đã lưu hồ sơ công ty.", "success")
  }, "L\u01B0u thay \u0111\u1ED5i"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "H\u1EE7y")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-4)",
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "md",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "Th\xE0nh vi\xEAn"), [["Phạm Thu Trang", "Quản trị công ty"], ["Đỗ Quang Huy", "Nhà tuyển dụng"], ["Ngô Thanh Sơn", "Chỉ xem"]].map(([n, r]) => /*#__PURE__*/React.createElement("div", {
    key: n,
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: n,
    size: "sm"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: "grid"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-strong)"
    }
  }, n), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)",
      color: "var(--text-muted)"
    }
  }, r)), /*#__PURE__*/React.createElement(IconButton, {
    icon: "ellipsis-vertical",
    label: "T\xF9y ch\u1ECDn",
    size: "sm"
  }))), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    size: "sm",
    icon: "user-plus"
  }, "M\u1EDDi th\xE0nh vi\xEAn")), /*#__PURE__*/React.createElement(Card, {
    padding: "md",
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-label)",
      color: "var(--text-strong)"
    }
  }, "Th\xF4ng b\xE1o"), /*#__PURE__*/React.createElement(Switch, {
    label: "Email khi c\xF3 h\u1ED3 s\u01A1 m\u1EDBi",
    checked: true,
    onChange: () => {}
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "Email khi tin \u0111\u01B0\u1EE3c duy\u1EC7t",
    checked: true,
    onChange: () => {}
  }), /*#__PURE__*/React.createElement(Switch, {
    label: "Nh\u1EAFc tr\u01B0\u1EDBc khi tin h\u1EBFt h\u1EA1n",
    checked: false,
    onChange: () => {}
  }))));
}
Object.assign(window, {
  CandidatesScreen,
  CompanyScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/employer_portal/PeopleScreens.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing_site/Data.jsx
try { (() => {
const JOBS = [{
  id: 1,
  title: "Thực tập sinh Frontend (ReactJS)",
  company: "FPT Software",
  verified: true,
  isNew: true,
  location: "Hà Nội",
  salary: "4 – 6 triệu / tháng",
  deadline: "Còn 12 ngày",
  tags: ["React", "3 tháng", "Hybrid"]
}, {
  id: 2,
  title: "Thực tập sinh Digital Marketing",
  company: "Tiki",
  verified: true,
  isNew: true,
  location: "TP. Hồ Chí Minh",
  salary: "3 – 5 triệu / tháng",
  deadline: "Còn 4 ngày",
  tags: ["Content", "6 tháng"]
}, {
  id: 3,
  title: "Thực tập sinh Kiểm thử phần mềm",
  company: "VNG Corporation",
  verified: true,
  location: "TP. Hồ Chí Minh",
  salary: "Thỏa thuận",
  deadline: "Còn 20 ngày",
  tags: ["Manual QA", "6 tháng"]
}, {
  id: 5,
  title: "Thực tập sinh Nhân sự (Tuyển dụng)",
  company: "Techcombank",
  verified: true,
  location: "Hà Nội",
  salary: "4 triệu / tháng",
  deadline: "Còn 15 ngày",
  tags: ["HR", "Hybrid"]
}];
Object.assign(window, {
  JOBS
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing_site/Data.jsx", error: String((e && e.message) || e) }); }

// ui_kits/marketing_site/Sections.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
var {
  Icon,
  Avatar,
  Badge,
  Button,
  Card,
  JobCard,
  Input,
  Select,
  RoleBadge,
  StatCard
} = window.InternHubDesignSystem_f6cc55;
function Photo({
  label,
  height = 280,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height,
      borderRadius: "var(--radius-xl)",
      background: "var(--surface-sunken)",
      border: "var(--border-w) dashed var(--border-strong)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-2)",
      color: "var(--text-subtle)",
      textAlign: "center",
      padding: "var(--space-4)",
      ...style
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "image",
    size: 22
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)"
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-meta)"
    }
  }, "Ch\u1ED7 d\xE0nh cho \u1EA3nh th\u1EADt \u2014 ch\u01B0a c\xF3 t\u01B0 li\u1EC7u"));
}
function SiteHeader() {
  const links = ["Việc thực tập", "Công ty", "Cẩm nang", "Dành cho doanh nghiệp"];
  return /*#__PURE__*/React.createElement("header", {
    style: {
      position: "sticky",
      top: 0,
      zIndex: 20,
      background: "rgba(255,255,255,0.92)",
      backdropFilter: "var(--blur-glass)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--layout-max)",
      margin: "0 auto",
      height: 72,
      display: "flex",
      alignItems: "center",
      gap: "var(--space-6)",
      padding: "0 var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("a", {
    href: "#",
    style: {
      display: "flex",
      alignItems: "center",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    alt: "",
    style: {
      height: 30
    }
  }), /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-wordmark.svg",
    alt: "InternHub",
    style: {
      height: 19
    }
  })), /*#__PURE__*/React.createElement("nav", {
    style: {
      display: "flex",
      gap: "var(--space-5)",
      flex: 1
    }
  }, links.map(l => /*#__PURE__*/React.createElement("a", {
    key: l,
    href: "#",
    style: {
      font: "var(--type-label)",
      color: "var(--text-body)",
      textDecoration: "none"
    }
  }, l))), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    as: "a",
    href: "../candidate_web/index.html"
  }, "\u0110\u0103ng nh\u1EADp"), /*#__PURE__*/React.createElement(Button, {
    as: "a",
    href: "../candidate_web/index.html"
  }, "T\u1EA1o h\u1ED3 s\u01A1 mi\u1EC5n ph\xED")));
}
function Hero() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: "var(--surface-brand-deep)",
      color: "var(--n-0)",
      padding: "var(--space-20) var(--space-6) var(--space-16)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--layout-max)",
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "1.1fr 0.9fr",
      gap: "var(--space-12)",
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-caps)",
      color: "var(--pine-200)"
    }
  }, "N\u1EC1n t\u1EA3ng th\u1EF1c t\u1EADp cho sinh vi\xEAn Vi\u1EC7t Nam"), /*#__PURE__*/React.createElement("h1", {
    style: {
      font: "var(--type-display)",
      color: "var(--n-0)",
      letterSpacing: "var(--tracking-tight)",
      maxWidth: 620
    }
  }, "K\u1EBFt n\u1ED1i th\u1EF1c t\u1EADp, m\u1EDF \u0111\u1EA7u s\u1EF1 nghi\u1EC7p."), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-lg)",
      color: "var(--pine-100)",
      maxWidth: 520
    }
  }, "Tin tuy\u1EC3n d\u1EE5ng th\u1EF1c t\u1EADp t\u1EEB doanh nghi\u1EC7p \u0111\xE3 x\xE1c th\u1EF1c, t\u1EADp trung \u1EDF m\u1ED9t n\u01A1i. B\u1EA1n theo d\xF5i \u0111\u01B0\u1EE3c t\u1EEBng h\u1ED3 s\u01A1 \u0111\xE3 g\u1EEDi, t\u1EEB l\xFAc g\u1EEDi t\u1EDBi l\xFAc c\xF3 k\u1EBFt qu\u1EA3."), /*#__PURE__*/React.createElement(Card, {
    padding: "sm",
    style: {
      display: "flex",
      gap: "var(--space-2)",
      maxWidth: 620
    }
  }, /*#__PURE__*/React.createElement(Input, {
    icon: "search",
    placeholder: "V\u1ECB tr\xED, k\u1EF9 n\u0103ng ho\u1EB7c c\xF4ng ty",
    style: {
      flex: 1.4
    }
  }), /*#__PURE__*/React.createElement(Select, {
    options: ["Tất cả khu vực", "Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng"],
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(Button, {
    icon: "search"
  }, "T\xECm vi\u1EC7c")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-6)",
      font: "var(--type-body-sm)",
      color: "var(--pine-200)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "badge-check",
    size: 16
  }), "1.240 doanh nghi\u1EC7p \u0111\xE3 x\xE1c th\u1EF1c"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: "inline-flex",
      gap: 6,
      alignItems: "center"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "briefcase",
    size: 16
  }), "3.800 tin th\u1EF1c t\u1EADp \u0111ang m\u1EDF"))), /*#__PURE__*/React.createElement(Photo, {
    label: "\u1EA2nh: sinh vi\xEAn trao \u0111\u1ED5i v\u1EDBi nh\xE0 tuy\u1EC3n d\u1EE5ng t\u1EA1i ng\xE0y h\u1ED9i vi\u1EC7c l\xE0m",
    height: 360,
    style: {
      background: "rgba(255,255,255,0.06)",
      borderColor: "rgba(255,255,255,0.24)",
      color: "var(--pine-200)"
    }
  })));
}
function Roles() {
  const roles = [{
    role: "candidate",
    title: "Sinh viên",
    body: "Tạo hồ sơ một lần, ứng tuyển nhiều nơi và theo dõi trạng thái từng hồ sơ.",
    points: ["Lọc theo ngành, khu vực, mức lương", "Lưu tin và nhận thông báo tin mới", "Nhắn tin trực tiếp với nhà tuyển dụng"]
  }, {
    role: "employer",
    title: "Doanh nghiệp",
    body: "Đăng tin thực tập, quản lý hồ sơ theo từng bước tuyển dụng.",
    points: ["Quy trình duyệt tin linh hoạt theo công ty", "Phân quyền cho từng thành viên HR", "Xem CV và trao đổi ngay trên nền tảng"]
  }, {
    role: "admin",
    title: "Quản trị nền tảng",
    body: "Xác thực doanh nghiệp và kiểm duyệt nội dung tin tuyển dụng.",
    points: ["Xác thực theo mã số thuế và giấy phép", "Hàng đợi duyệt tin với dấu hiệu cảnh báo", "Lịch sử xử lý minh bạch"]
  }];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--layout-max)",
      margin: "0 auto",
      padding: "var(--space-16) var(--space-6)",
      display: "grid",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-2)",
      maxWidth: 640
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h1)"
    }
  }, "Ba vai tr\xF2, m\u1ED9t n\u1EC1n t\u1EA3ng"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-lg)",
      color: "var(--text-muted)"
    }
  }, "M\u1ED7i vai tr\xF2 c\xF3 kh\xF4ng gian l\xE0m vi\u1EC7c ri\xEAng, d\xF9ng chung m\u1ED9t v\xF2ng \u0111\u1EDDi tin tuy\u1EC3n d\u1EE5ng.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(3,1fr)",
      gap: "var(--space-4)"
    }
  }, roles.map(r => /*#__PURE__*/React.createElement(Card, {
    key: r.role,
    padding: "lg",
    style: {
      display: "grid",
      gap: "var(--space-3)",
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement(RoleBadge, {
    role: r.role,
    style: {
      justifySelf: "start"
    }
  }), /*#__PURE__*/React.createElement("h3", {
    style: {
      font: "var(--type-h2)",
      fontSize: "var(--text-xl)"
    }
  }, r.title), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body)",
      color: "var(--text-body)"
    }
  }, r.body), /*#__PURE__*/React.createElement("ul", {
    style: {
      margin: 0,
      paddingLeft: 0,
      listStyle: "none",
      display: "grid",
      gap: "var(--space-2)"
    }
  }, r.points.map(p => /*#__PURE__*/React.createElement("li", {
    key: p,
    style: {
      display: "flex",
      gap: "var(--space-2)",
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 16,
    style: {
      color: "var(--pine-500)",
      marginTop: 2
    }
  }), p)))))));
}
function Lifecycle() {
  const steps = [["Đăng tin", "Doanh nghiệp soạn tin và gửi duyệt."], ["Kiểm duyệt", "Admin kiểm tra nội dung và doanh nghiệp."], ["Hiển thị", "Sinh viên tìm thấy và ứng tuyển."], ["Theo dõi", "Hai bên trao đổi tới khi có kết quả."]];
  return /*#__PURE__*/React.createElement("section", {
    style: {
      background: "var(--surface-card)",
      borderTop: "var(--border-w) solid var(--border-subtle)",
      borderBottom: "var(--border-w) solid var(--border-subtle)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--layout-max)",
      margin: "0 auto",
      padding: "var(--space-16) var(--space-6)",
      display: "grid",
      gap: "var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h1)"
    }
  }, "M\u1ED9t tin tuy\u1EC3n d\u1EE5ng \u0111i qua b\u1ED1n b\u01B0\u1EDBc"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(4,1fr)",
      gap: "var(--space-4)"
    }
  }, steps.map(([t, d], i) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: "grid",
      gap: "var(--space-2)",
      paddingTop: "var(--space-4)",
      borderTop: "var(--border-w-thick) solid var(--pine-500)"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-mono)",
      color: "var(--pine-600)"
    }
  }, "0", i + 1), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-h3)",
      color: "var(--text-strong)"
    }
  }, t), /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--text-muted)"
    }
  }, d))))));
}
function Featured() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--layout-max)",
      margin: "0 auto",
      padding: "var(--space-16) var(--space-6)",
      display: "grid",
      gap: "var(--space-5)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "flex-end",
      gap: "var(--space-4)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h1)",
      flex: 1
    }
  }, "Tin m\u1EDBi trong tu\u1EA7n"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    iconAfter: "arrow-right",
    as: "a",
    href: "../candidate_web/index.html"
  }, "Xem t\u1EA5t c\u1EA3 tin")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gridTemplateColumns: "repeat(2,1fr)",
      gap: "var(--space-3)"
    }
  }, JOBS.slice(0, 4).map(j => /*#__PURE__*/React.createElement(JobCard, _extends({
    key: j.id
  }, j, {
    onClick: () => {}
  })))));
}
function EmployerCta() {
  return /*#__PURE__*/React.createElement("section", {
    style: {
      maxWidth: "var(--layout-max)",
      margin: "0 auto var(--space-16)",
      padding: "0 var(--space-6)"
    }
  }, /*#__PURE__*/React.createElement(Card, {
    padding: "lg",
    style: {
      background: "var(--surface-brand-soft)",
      borderColor: "var(--pine-100)",
      display: "grid",
      gridTemplateColumns: "1.2fr 0.8fr",
      gap: "var(--space-8)",
      alignItems: "center",
      padding: "var(--space-10)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      font: "var(--type-h1)",
      color: "var(--pine-800)"
    }
  }, "\u0110ang t\xECm th\u1EF1c t\u1EADp sinh?"), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-lg)",
      color: "var(--pine-700)",
      maxWidth: 520
    }
  }, "X\xE1c th\u1EF1c doanh nghi\u1EC7p m\u1ED9t l\u1EA7n, sau \u0111\xF3 \u0111\u0103ng tin kh\xF4ng gi\u1EDBi h\u1EA1n trong k\u1EF3 tuy\u1EC3n d\u1EE5ng. H\u1ED3 s\u01A1 \u1EE9ng vi\xEAn v\u1EC1 \u0111\xFAng m\u1ED9t n\u01A1i."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: "var(--space-2)"
    }
  }, /*#__PURE__*/React.createElement(Button, {
    as: "a",
    href: "../employer_portal/index.html",
    icon: "building-2"
  }, "\u0110\u0103ng tin tuy\u1EC3n d\u1EE5ng"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    as: "a",
    href: "../employer_portal/index.html"
  }, "Xem c\xE1ch ho\u1EA1t \u0111\u1ED9ng"))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-3)"
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    icon: "clock",
    label: "Th\u1EDDi gian duy\u1EC7t tin trung b\xECnh",
    value: "8",
    unit: "gi\u1EDD"
  }), /*#__PURE__*/React.createElement(StatCard, {
    icon: "users",
    label: "H\u1ED3 s\u01A1 / tin trung b\xECnh",
    value: "19",
    unit: "h\u1ED3 s\u01A1"
  }))));
}
function SiteFooter() {
  const cols = [["Sinh viên", ["Tìm việc thực tập", "Cẩm nang viết CV", "Công ty đã xác thực"]], ["Doanh nghiệp", ["Đăng tin tuyển dụng", "Xác thực doanh nghiệp", "Giá dịch vụ"]], ["InternHub", ["Về chúng tôi", "Tuyển dụng", "Liên hệ"]], ["Pháp lý", ["Điều khoản sử dụng", "Chính sách dữ liệu cá nhân", "Xử lý báo cáo vi phạm"]]];
  return /*#__PURE__*/React.createElement("footer", {
    style: {
      background: "var(--surface-brand-deep)",
      color: "var(--pine-100)",
      padding: "var(--space-12) var(--space-6) var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--layout-max)",
      margin: "0 auto",
      display: "grid",
      gridTemplateColumns: "1.4fr repeat(4,1fr)",
      gap: "var(--space-8)"
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: "grid",
      gap: "var(--space-3)",
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-full-inverse.svg",
    alt: "InternHub",
    style: {
      height: 64,
      justifySelf: "start"
    }
  }), /*#__PURE__*/React.createElement("p", {
    style: {
      font: "var(--type-body-sm)",
      color: "var(--pine-200)",
      maxWidth: 280
    }
  }, "N\u1EC1n t\u1EA3ng k\u1EBFt n\u1ED1i sinh vi\xEAn v\xE0 doanh nghi\u1EC7p t\u1EA1i Vi\u1EC7t Nam.")), cols.map(([t, items]) => /*#__PURE__*/React.createElement("div", {
    key: t,
    style: {
      display: "grid",
      gap: "var(--space-2)",
      alignContent: "start"
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      font: "var(--type-eyebrow)",
      textTransform: "uppercase",
      letterSpacing: "var(--tracking-caps)",
      color: "var(--n-0)"
    }
  }, t), items.map(i => /*#__PURE__*/React.createElement("a", {
    key: i,
    href: "#",
    style: {
      font: "var(--type-body-sm)",
      color: "var(--pine-200)",
      textDecoration: "none"
    }
  }, i))))), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: "var(--layout-max)",
      margin: "var(--space-8) auto 0",
      paddingTop: "var(--space-5)",
      borderTop: "1px solid rgba(255,255,255,0.16)",
      display: "flex",
      justifyContent: "space-between",
      font: "var(--type-body-sm)",
      color: "var(--pine-200)"
    }
  }, /*#__PURE__*/React.createElement("span", null, "\xA9 2026 InternHub. K\u1EBFt n\u1ED1i th\u1EF1c t\u1EADp, m\u1EDF \u0111\u1EA7u s\u1EF1 nghi\u1EC7p."), /*#__PURE__*/React.createElement("span", null, "H\xE0 N\u1ED9i \xB7 TP. H\u1ED3 Ch\xED Minh")));
}
Object.assign(window, {
  SiteHeader,
  Hero,
  Roles,
  Lifecycle,
  Featured,
  EmployerCta,
  SiteFooter,
  Photo
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/marketing_site/Sections.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.JobCard = __ds_scope.JobCard;

__ds_ns.RoleBadge = __ds_scope.RoleBadge;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.StatusPill = __ds_scope.StatusPill;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Field = __ds_scope.Field;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.Switch = __ds_scope.Switch;

__ds_ns.Textarea = __ds_scope.Textarea;

__ds_ns.Pagination = __ds_scope.Pagination;

__ds_ns.SideNav = __ds_scope.SideNav;

__ds_ns.Tabs = __ds_scope.Tabs;

})();
