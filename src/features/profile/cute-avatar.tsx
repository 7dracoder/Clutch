import Image from "next/image";

export const OPERATOR_AVATAR_SRC = "/avatars/operator-dog.png";

/** Round operator avatar using the desk mascot image. */
export function CuteAvatar({
  size = 40,
  className = "",
  alt = "Operator avatar",
}: {
  size?: number;
  className?: string;
  alt?: string;
}) {
  return (
    <span
      className={`cute-avatar ${className}`.trim()}
      style={{ width: size, height: size }}
    >
      <Image
        src={OPERATOR_AVATAR_SRC}
        alt={alt}
        width={size}
        height={size}
        className="cute-avatar-image"
        priority={size >= 64}
      />
    </span>
  );
}
