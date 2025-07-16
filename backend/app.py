from flask import Flask, jsonify
from flask_cors import CORS
from pyomo.environ import *
from datetime import date, timedelta

app = Flask(__name__)
CORS(app)

people = ["Alice", "Bob", "Charlie", "Dana", "Eve"]
holidays = {date(2025, 7, 17)}  # Add more holidays here

def cost_fn(d):
    if d.weekday() >= 5 or d in holidays:
        return 3
    return 1

@app.route("/generate-schedule")
def generate_schedule():
    start_date = date(2025, 7, 1)
    end_date = date(2025, 7, 31)
    days = [start_date + timedelta(days=i) for i in range((end_date - start_date).days + 1)]

    model = ConcreteModel()
    model.P = Set(initialize=people)
    model.D = Set(initialize=days)
    model.x = Var(model.P, model.D, domain=Binary)

    # Objective: Minimize cost
    model.cost = Objective(
        expr=sum(cost_fn(d) * model.x[p, d] for p in model.P for d in model.D),
        sense=minimize
    )

    # Constraint: One person per day
    model.one_per_day = ConstraintList()
    for d in model.D:
        model.one_per_day.add(expr=sum(model.x[p, d] for p in model.P) == 1)

    # Constraint: No person on two consecutive days
    model.no_consecutive = ConstraintList()
    sorted_days = sorted(model.D)
    for i in range(len(sorted_days) - 1):
        d1 = sorted_days[i]
        d2 = sorted_days[i + 1]
        for p in model.P:
            model.no_consecutive.add(expr=model.x[p, d1] + model.x[p, d2] <= 1)

    # Constraint: Equal total assignments (6 or 7 per person)
    total_days = len(days)
    base = total_days // len(people)
    remainder = total_days % len(people)

    for i, p in enumerate(people):
        total = sum(model.x[p, d] for d in model.D)
        exact_days = base + 1 if i < remainder else base
        model.add_component(f"{p}_exact_total", Constraint(expr=total == exact_days))

    # Constraint: Equal weekend + holiday assignments
    W = [d for d in days if d.weekday() >= 5 or d in holidays]
    w_base = len(W) // len(people)
    w_rem = len(W) % len(people)

    for i, p in enumerate(people):
        w_sum = sum(model.x[p, d] for d in W)
        exact_w = w_base + 1 if i < w_rem else w_base
        model.add_component(f"{p}_exact_hard_days", Constraint(expr=w_sum == exact_w))

    # Solve
    solver = SolverFactory("highs")
    solver.solve(model, tee=True)

    # Extract result
    result = []
    for d in days:
        for p in people:
            if value(model.x[p, d]) > 0.5:
                result.append({
                    "title": p,
                    "date": d.strftime("%Y-%m-%d")
                })

    print(result)
    return jsonify(result)

if __name__ == "__main__":
    app.run(debug=True)
