import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export const DraggableAsset = ({
  src,
  className,
  offset,
  speed = 0.5,
  width,
}: {
  src: string;
  className: string;
  offset: number;
  speed?: number;
  width: string;
}) => {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 1000], [offset, offset - 200 * speed]);
  const constraintsRef = useRef(null);

  return (
    <motion.div
      ref={constraintsRef}
      className={`absolute z-30 ${className}`}
      style={{ y, width, height: width }}
    >
      <motion.img
        src={src}
        drag
        dragElastic={0.2}
        dragConstraints={{ top: -50, bottom: 50, left: -50, right: 50 }}
        whileHover={{ scale: 1.1, cursor: "grab" }}
        whileDrag={{ scale: 1.2, cursor: "grabbing" }}
        className="w-full h-full object-contain drop-shadow-2xl"
        alt=""
        draggable={false}
      />
    </motion.div>
  );
};

export default DraggableAsset;
