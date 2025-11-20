export const VertexIcon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </svg>
);

export const EdgeIcon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M16 5L8 19" />
    <circle cx="6" cy="19" r="2" fill="currentColor" />
    <circle cx="18" cy="5" r="2" fill="currentColor" />
  </svg>
);

export const FaceIcon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    {...props}
  >
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5-10-5-10 5z" />
  </svg>
);

export const TorusIcon = (props) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...props}
    >
        <path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z" />
        <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
    </svg>
);

export const RoboticArmIcon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 8L6 14" />
    <path d="M12 11l8-3" />
    <path d="M10 13L4 9" />
    <circle cx="19" cy="5" r="1" fill="currentColor" />
    <circle cx="5" cy="8" r="1" fill="currentColor" />
    <circle cx="20" cy="13" r="1" fill="currentColor" />
    <circle cx="3" cy="15" r="1" fill="currentColor" />
    <path d="M12 11v10" />
    <path d="M10 21h4" />
  </svg>
);

export const GunIcon = (props) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M16 4h3v4" />
    <path d="M17.5 5.5L14 9" />
    <path d="M21 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
    <path d="M7 12h5" />
    <path d="M9 10v4" />
  </svg>
);
