import type { Locator, Page } from "@playwright/test"

import { DEMO_FORM, expect } from "./fixtures.ts"

/** The inputs of the seeded Person details form (spec section 10), in visual order. */
export const INPUTS = [
  { name: "firstName", label: "First name", required: true },
  { name: "surname", label: "Surname", required: true },
  { name: "email", label: "Email", required: true },
  { name: "dateOfBirth", label: "Date of birth", required: true },
  { name: "dependants", label: "Number of dependants", required: false },
  { name: "preferredContact", label: "Preferred contact method", required: true },
  { name: "notes", label: "Notes", required: false },
  { name: "subscribe", label: "Subscribe to updates", required: false },
  { name: "acceptTerms", label: "I accept the terms", required: true },
] as const

export type InputName = (typeof INPUTS)[number]["name"]

/** Every instance in the form, containers and buttons included. */
export const INSTANCES = [
  "nameRow",
  "firstName",
  "surname",
  "email",
  "detailsRow",
  "dateOfBirth",
  "dependants",
  "preferredContact",
  "notes",
  "preferences",
  "subscribe",
  "acceptTerms",
  "actions",
  "submit",
  "reset",
] as const

export const REQUIRED = INPUTS.filter((input) => input.required).map((input) => input.name)

/** Locators for the form's parts, by the test ids and roles the spec fixes. */
export function demoForm(page: Page) {
  const root = (name: string) => page.getByTestId(`field-${name}`)
  const textbox = (name: string) => root(name).getByRole("textbox")
  return {
    form: page.getByTestId("form"),
    root,
    error: (name: string) => page.getByTestId(`field-${name}-error`),
    value: (name: string) => page.getByTestId(`field-${name}-value`),
    firstName: textbox("firstName"),
    surname: textbox("surname"),
    email: textbox("email"),
    dateOfBirth: textbox("dateOfBirth"),
    calendarButton: root("dateOfBirth").getByRole("button"),
    calendar: page.getByTestId("field-dateOfBirth-popup"),
    dependants: textbox("dependants"),
    preferredContact: root("preferredContact").getByRole("combobox"),
    options: page.getByTestId("field-preferredContact-popup"),
    notes: textbox("notes"),
    subscribe: root("subscribe").getByRole("switch"),
    acceptTerms: root("acceptTerms").getByRole("checkbox"),
    submit: root("submit"),
    reset: root("reset"),
    success: page.getByTestId("form-submit-success"),
    submittedData: page.getByTestId("form-submitted-data"),
    modeEdit: page.getByTestId("form-mode-edit"),
    modeReadOnly: page.getByTestId("form-mode-read-only"),
  }
}

export type DemoForm = ReturnType<typeof demoForm>

export async function openDemoForm(page: Page): Promise<DemoForm> {
  await page.goto(DEMO_FORM.path)
  const form = demoForm(page)
  await expect(form.form).toBeVisible()
  await expect(form.firstName).toBeVisible()
  return form
}

/** The control a person focuses for each input, in visual order. */
export function controls(form: DemoForm): Record<InputName, Locator> {
  return {
    firstName: form.firstName,
    surname: form.surname,
    email: form.email,
    dateOfBirth: form.dateOfBirth,
    dependants: form.dependants,
    preferredContact: form.preferredContact,
    notes: form.notes,
    subscribe: form.subscribe,
    acceptTerms: form.acceptTerms,
  }
}

/** The button for one day in the open calendar. */
export const dayButton = (form: DemoForm, iso: string) =>
  form.calendar.locator(`button[data-day="${iso}"]`)

/** Opens the calendar and picks a day by clicking it, as a mouse user would. */
export async function pickDate(form: DemoForm, iso: string) {
  const [year, month] = iso.split("-").map(Number)
  await form.calendarButton.click()
  await expect(form.calendar).toBeVisible()
  // The month and year dropdowns are native selects; their values are the
  // month index (0 to 11) and the year.
  const dropdowns = form.calendar.getByRole("combobox")
  await dropdowns.nth(1).selectOption(String(year))
  await dropdowns.nth(0).selectOption(String(month - 1))
  await dayButton(form, iso).click()
  await expect(form.calendar).toBeHidden()
}

export const VALID = {
  firstName: "Ada",
  surname: "Lovelace",
  email: "ada@example.com",
  dateOfBirth: "1990-03-14",
  dependants: "2",
  preferredContact: "Phone",
} as const

/** Fills every field validly with the mouse and keyboard, leaving Notes empty. */
export async function fillValid(form: DemoForm) {
  await form.firstName.fill(VALID.firstName)
  await form.surname.fill(VALID.surname)
  await form.email.fill(VALID.email)
  await pickDate(form, VALID.dateOfBirth)
  await form.dependants.fill(VALID.dependants)
  await form.preferredContact.click()
  await form.options.getByRole("option", { name: VALID.preferredContact }).click()
  await form.acceptTerms.click()
}

/** What a valid submit of `fillValid` hands over. */
export const VALID_SUBMISSION = {
  firstName: "Ada",
  surname: "Lovelace",
  email: "ada@example.com",
  dateOfBirth: "1990-03-14",
  dependants: 2,
  contact: { preferredMethod: "phone" },
  notes: null,
  preferences: { subscribe: true, acceptTerms: true },
}

export async function submitted(form: DemoForm): Promise<unknown> {
  return JSON.parse((await form.submittedData.textContent()) ?? "null")
}
