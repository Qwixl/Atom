import type {
  PaymentCaptureRequest,
  PaymentCaptureResult,
  PaymentHoldRequest,
  PaymentHoldResult,
  PaymentRail,
  PaymentReleaseRequest,
  PaymentReleaseResult,
} from "./types.js";
import { assertMonetaryAmount } from "./types.js";

interface MockHold {
  transactionId: string;
  amount: PaymentHoldResult["amount"];
  status: "requires_capture" | "canceled" | "succeeded";
  expiresAt: string;
  capturedAt?: string;
  releasedAt?: string;
}

/** In-memory payment rail for integration tests (manual capture semantics). */
export class MockPaymentRail implements PaymentRail {
  readonly id = "mock";
  private readonly holds = new Map<string, MockHold>();

  async placeHold(request: PaymentHoldRequest): Promise<PaymentHoldResult> {
    assertMonetaryAmount(request.amount);
    const railRef = `mock_pi_${request.transactionId}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.holds.set(railRef, {
      transactionId: request.transactionId,
      amount: request.amount,
      status: "requires_capture",
      expiresAt,
    });
    return {
      rail: this.id,
      railRef,
      amount: request.amount,
      status: "requires_capture",
      expiresAt,
    };
  }

  async captureHold(request: PaymentCaptureRequest): Promise<PaymentCaptureResult> {
    const hold = this.holds.get(request.railRef);
    if (!hold || hold.status !== "requires_capture") {
      throw new Error(`Mock hold not capturable: ${request.railRef}`);
    }
    const capturedAt = new Date().toISOString();
    hold.status = "succeeded";
    hold.capturedAt = capturedAt;
    return {
      railRef: request.railRef,
      amount: request.amount ?? hold.amount,
      capturedAt,
      status: "succeeded",
    };
  }

  async releaseHold(request: PaymentReleaseRequest): Promise<PaymentReleaseResult> {
    const hold = this.holds.get(request.railRef);
    if (!hold) {
      throw new Error(`Mock hold not found: ${request.railRef}`);
    }
    if (hold.status === "succeeded") {
      throw new Error(`Mock hold already captured: ${request.railRef}`);
    }
    const releasedAt = new Date().toISOString();
    hold.status = "canceled";
    hold.releasedAt = releasedAt;
    return { railRef: request.railRef, status: "canceled", releasedAt };
  }

  getHold(railRef: string): MockHold | undefined {
    return this.holds.get(railRef);
  }
}

export function createMockPaymentRail(): MockPaymentRail {
  return new MockPaymentRail();
}
