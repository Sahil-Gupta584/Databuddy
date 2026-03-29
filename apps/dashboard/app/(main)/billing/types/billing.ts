export interface PaymentMethodCard {
	brand?: string;
	last4?: string;
	expMonth?: number;
	expYear?: number;
}

export interface PaymentMethodBillingDetails {
	name?: string;
	email?: string;
	address?: {
		city?: string;
		country?: string;
		line1?: string;
		line2?: string;
		postalCode?: string;
		state?: string;
	};
}

export interface PaymentMethod {
	id?: string;
	type?: string;
	card?: PaymentMethodCard;
	billingDetails?: PaymentMethodBillingDetails;
}

export interface CustomerWithPaymentMethod {
	name?: string | null;
	paymentMethod?: PaymentMethod;
}
