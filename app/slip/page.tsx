import type { Metadata } from "next"
import { SlipBuilder } from "@/components/slip-builder"

export const metadata: Metadata = {
  title: "My Slip — Pitchline",
  description: "Build and transfer a Pro bet slip to SportyBet.",
}

export default function SlipPage() {
  return <SlipBuilder />
}
