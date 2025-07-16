# ======= app.py (Flask backend) =======
from flask import Flask, request, jsonify
from flask_cors import CORS
from pyomo.environ import *
from datetime import date, timedelta
import jpholiday

app = Flask(__name__)
CORS(app)

people = ["Alice", "Bob", "Charlie", "Dana", "Eve"]

assignments = []  # Holds current schedule for frontend display
holidays = set()  # Store detected holidays

def cost_fn(d):
    if d.weekday() >= 5 or d in holidays:
        return 3
    return 1

@app.route("/generate-schedule")
def generate_schedule():
    global assignments, holidays

    start_date = date(2025, 7, 1)
    end_date = date(2025, 7, 31)
    days = [start_date + timedelta(days=i) for i in range((end_date - start_date).days + 1)]

    holidays = {d for d in days if jpholiday.is_holiday(d)}

    model = ConcreteModel()
    model.P = Set(initialize=people)
    model.D = Set(initialize=days)
    model.x = Var(model.P, model.D, domain=Binary)

    # Objective: Minimize cost
    model.cost = Objective(
        expr=sum(cost_fn(d) * model.x[p, d] for p in model.P for d in model.D),
        sense=minimize
    )

    # One person per day
    for d in model.D:
        model.add_component(f"one_per_day_{d}", Constraint(expr=sum(model.x[p, d] for p in model.P) == 1))

    # No two consecutive days
    sorted_days = sorted(model.D)
    for i in range(len(sorted_days) - 1):
        d1, d2 = sorted_days[i], sorted_days[i + 1]
        for p in model.P:
            model.add_component(f"no_consecutive_{p}_{d1}", Constraint(expr=model.x[p, d1] + model.x[p, d2] <= 1))

    # Equal total assignments
    base = len(days) // len(people)
    rem = len(days) % len(people)
    for i, p in enumerate(people):
        total = sum(model.x[p, d] for d in model.D)
        exact_days = base + 1 if i < rem else base
        model.add_component(f"{p}_total_days", Constraint(expr=total == exact_days))

    # Equal hard assignments (weekend or holiday)
    hard_days = [d for d in days if d.weekday() >= 5 or d in holidays]
    h_base = len(hard_days) // len(people)
    h_rem = len(hard_days) % len(people)
    for i, p in enumerate(people):
        h_sum = sum(model.x[p, d] for d in hard_days)
        h_target = h_base + 1 if i < h_rem else h_base
        model.add_component(f"{p}_hard_days", Constraint(expr=h_sum == h_target))

    solver = SolverFactory("highs")
    solver.solve(model, tee=True)

    # Save results
    assignments = []
    for d in days:
        for p in people:
            if value(model.x[p, d]) > 0.5:
                assignments.append({"title": p, "date": d.strftime("%Y-%m-%d")})

    return jsonify(assignments)

@app.route("/update-assignment", methods=["POST"])
def update_assignment():
    data = request.json
    print("Received manual update:", data)
    global assignments
    for a in assignments:
        if a["date"] == data["date"]:
            a["title"] = data["title"]
    return jsonify({"status": "updated"})

@app.route("/holidays")
def get_holidays():
    start_date = date(2025, 7, 1)
    end_date = date(2025, 7, 31)
    days = [start_date + timedelta(days=i) for i in range((end_date - start_date).days + 1)]
    holidays = {d for d in days if jpholiday.is_holiday(d)}
    print(jsonify([d.strftime("%Y-%m-%d") for d in sorted(holidays)]))
    return jsonify([d.strftime("%Y-%m-%d") for d in sorted(holidays)])

if __name__ == "__main__":
    app.run(debug=True)
