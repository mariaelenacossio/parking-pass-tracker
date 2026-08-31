import { Suspense } from "react";
import ParkingApp from "@/components/ParkingApp";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ParkingApp />
    </Suspense>
  );
}
