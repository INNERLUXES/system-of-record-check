# 2. A claim on a field comes before a claim on its entity

## Status

Accepted

## Context

Ownership in a real estate of systems is rarely whole. The CRM is the system of record of the customer, but the ERP
decides the credit limit and the payment terms; the people system owns the employee, but finance sets the cost centre.
A map that can only say "the CRM owns the customer" either hides the ERP fields or makes every one of them a conflict.
A map that can only name owners field by field makes a long list for every entity and leaves no one owning the record
as a whole: who creates a customer, and which record is the customer when two disagree.

A second question is what an owner of an entity owns when it does not hold every field. If the CRM owns the customer
and the shop alone holds `customer.loyaltyTier`, saying the CRM owns that field would name an owner that has no copy
to be the truth.

## Decision

1. A system claims an entity with `owns: true`, or claims fields of it with `owns: [field, ...]`.
2. A claim on a field comes before a claim on its entity: when one system claims the customer and another claims
   `customer.creditLimit`, the second owns the credit limit, and that is not a conflict.
3. A system that claims an entity owns the fields of it that it holds, and no others. A field held by several systems
   that no system claims and the owner of its entity does not hold has no owner.
4. An entity held by several systems needs an owner of its own, even when each of its fields has one; with no owner it
   is reported once, and its fields are not reported one by one.
5. Two claims of the same kind on the same thing are a conflict: two systems with `owns: true` on an entity, or two
   systems naming the same field in `owns`.

## Consequences

- The common split (the CRM owns the customer, the ERP owns its credit fields) is written in two short lines and passes.
- A field that moves to another owner is moved by one entry in `owns`, and the matrix shows the change.
- A map with no `owns` at all reports each shared entity once, which keeps the first run of a large map readable.
- A team that wants the owner of an entity to own every field must give it every field; the tool does not invent
  fields an owner does not hold.
