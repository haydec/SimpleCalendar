# Updated Flask app.py to use frontend-provided holidays, weekends, and cage-changing days

from flask import Flask, request, jsonify
from flask_cors import CORS
from pyomo.environ import *
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)

people = ["Alice", "Bob", "Charlie", "Dana", "Eve"]
assignments = []

# These will be set via the /calendar-settings endpoint
calendar_config = {
    "start_date": None,
    "end_date": None,
    "holidays": set(),
    "weekends": set(),
    "cage_days": set()
}

def cost_fn(d):
    # Higher cost for weekend, holiday, or cage change day
    if d in calendar_config["cage_days"]:
        return 1 # Highest cost
    elif d in calendar_config["holidays"]:
        return 3
    elif d in calendar_config["weekends"]:
        return 3
    return 1

@app.route("/generate-schedule")
def generate_schedule():
    global assignments

    if not calendar_config["start_date"] or not calendar_config["end_date"]:
        print("generate-schedule blocked: calendar_config incomplete")
        return jsonify({"error": "Calendar settings not received yet."}), 400

    start_date = datetime.strptime(calendar_config["start_date"], "%Y-%m-%d").date()
    end_date = datetime.strptime(calendar_config["end_date"], "%Y-%m-%d").date()
    days = [start_date + timedelta(days=i) for i in range((end_date - start_date).days)]

    model = ConcreteModel()
    model.P = Set(initialize=people)
    model.D = Set(initialize=days)
    model.x = Var(model.P, model.D, domain=Binary)

    # Objective
    model.cost = Objective(
        expr=sum(cost_fn(d) * model.x[p, d] for p in model.P for d in model.D),
        sense=minimize
    )

    # One person per day
    for d in model.D:
        model.add_component(f"one_per_day_{d}", Constraint(expr=sum(model.x[p, d] for p in model.P) == 1))

    # No person on two consecutive days
    sorted_days = sorted(model.D)
    for i in range(len(sorted_days) - 1):
        d1, d2 = sorted_days[i], sorted_days[i + 1]
        for p in model.P:
            model.add_component(f"no_consec_{p}_{d1}", Constraint(expr=model.x[p, d1] + model.x[p, d2] <= 1))

    # Equal number of total assignments
    base = len(days) // len(people)
    rem = len(days) % len(people)
    for i, p in enumerate(people):
        total = sum(model.x[p, d] for d in model.D)
        expected = base + 1 if i < rem else base
        model.add_component(f"assignments_{p}", Constraint(expr=total == expected))

    # Equal hard day (holiday/weekend/cage) assignments
    hard_days = calendar_config["holidays"] | calendar_config["weekends"] | calendar_config["cage_days"]
    h_base = len(hard_days) // len(people)
    h_rem = len(hard_days) % len(people)
    for i, p in enumerate(people):
        h_total = sum(model.x[p, d] for d in hard_days)
        expected = h_base + 1 if i < h_rem else h_base
        model.add_component(f"hard_days_{p}", Constraint(expr=h_total == expected))

    solver = SolverFactory("highs")
    solver.solve(model)

    assignments = [
        {"title": p, "date": d.strftime("%Y-%m-%d")}
        for d in days for p in people
        if value(model.x[p, d]) > 0.5
    ]

    return jsonify(assignments)

@app.route("/update-assignment", methods=["POST"])
def update_assignment():
    data = request.json
    for a in assignments:
        if a["date"] == data["date"]:
            a["title"] = data["title"]
    return jsonify({"status": "updated"})

@app.route("/calendar-settings", methods=["POST"])
def calendar_settings():
    global calendar_config
    data = request.get_json()
    print("Data received:", data)
    try:
        calendar_config["start_date"] = data["start_date"]
        calendar_config["end_date"] = data["end_date"]
        calendar_config["holidays"] = {datetime.strptime(d, "%Y-%m-%d").date() for d in data["holidays"]}
        calendar_config["weekends"] = {datetime.strptime(d, "%Y-%m-%d").date() for d in data["weekends"]}

        nth_fridays = data.get("nth_fridays", [])
        start = datetime.strptime(calendar_config["start_date"], "%Y-%m-%d").date()
        end = datetime.strptime(calendar_config["end_date"], "%Y-%m-%d").date()
        cage_days = set()
        for n in nth_fridays:
            fridays = [start + timedelta(days=i) for i in range((end - start).days)
                       if (start + timedelta(days=i)).weekday() == 4]  # Friday
            if len(fridays) >= n:
                cage_days.add(fridays[n - 1])
            if len(fridays) >= n + 2:  # also add n+2th for 4th Friday case (hard coded logic)
                cage_days.add(fridays[n + 1])
        calendar_config["cage_days"] = cage_days

        print("Calendar config updated.")
        return jsonify({"status": "OK"})
    except Exception as e:
        print("Calendar config error:", e)
        return jsonify({"status": "error", "message": str(e)}), 400

if __name__ == "__main__":
    app.run(debug=True)