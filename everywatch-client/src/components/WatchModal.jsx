import React, { useEffect, useId, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";

export function WatchModal({ watch, onClose }) {
  const ref = useRef(null);
  const id = useId();

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    const listener = (e) => {
      if (!ref.current || ref.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, onClose]);

  if (!watch) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 bg-black/80 grid place-items-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          ref={ref}
          className="w-full max-w-4xl bg-[#030712] text-[#F9FAFA] rounded-lg overflow-hidden shadow-xl"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
        >
          <img
            src={watch.Image}
            alt={watch.Model || "Watch Image"}
            className="w-full h-[400px] object-contain bg-black"
          />
          <div className="p-6 space-y-2 max-h-[70vh] overflow-y-auto">
            <h2 className="text-xl font-bold">{watch.Brand} – {watch.Model}</h2>
            <p className="text-sm text-[#CBD5E1]">{watch.Reference}</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><strong>Price:</strong> {watch.Price}</div>
              <div><strong>Condition:</strong> {watch.Condition}</div>
              <div><strong>Box:</strong> {watch.Box}</div>
              <div><strong>Papers:</strong> {watch.Papers}</div>
              <div><strong>Seller:</strong> {watch.Seller}</div>
              <div><strong>Country:</strong> {watch.Country}</div>
              <div><strong>Listed For:</strong> {watch.ListedFor}</div>
              <div><strong>Last Seen:</strong> {watch.LastSeenDate}</div>
            </div>
            <a
              href={watch.URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-4 text-[#6366F1] underline"
            >
              View Listing
            </a>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 bg-[#111827] text-[#F9FAFA] p-2 rounded-full hover:bg-[#1f2937]"
            >
              ✕
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
