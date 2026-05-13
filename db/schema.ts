import { pgTable, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const tasks = pgTable("tasks", {
  id: text().primaryKey(),
  title: text().notNull(),
  status: text().notNull().default("new"),
  site: text().notNull().default("all"),
  category: text().notNull(),
  priority: text().notNull().default(""),
  notes: text().notNull().default(""),
  deps: text().notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  taskOrder: integer("task_order").notNull().default(0),
  hiddenFromReport: boolean("hidden_from_report").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});
