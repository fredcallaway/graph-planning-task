using Graphs
using Random

model_dir = "../model/"
include("$model_dir/problem.jl")
include("$model_dir/utils.jl")

IMAGES = [
    "static/images/Animal_Sea_Solid_Small.png",
    "static/images/Animal_Sea_Pattern_Small.png",
    "static/images/Animal_Land_Solid_Large.png",
    "static/images/Animal_Land_Pattern_Small.png",
    "static/images/Object_Sea_Solid_Large.png",
    "static/images/Object_Sea_Pattern_Large.png",
    "static/images/Object_Land_Solid_Small.png",
    "static/images/Object_Land_Pattern_Large.png",
]
parse_features(img) = split(rsplit(img, "/")[end], "_")[1:3]
FEATURES = map(IMAGES) do img
    parse_features(IMAGES[1]) .== parse_features(img)
end

function describe_mask(mask)
    lookup = [
        Dict(true => "Animal", false => "Object"),
        Dict(true => "Sea", false => "Land"),
        Dict(true => "Solid", false => "Pattern"),
    ]
    items = map(1:3, mask) do i, m
        ismissing(m) && return missing
        lookup[i][m]
    end |> skipmissing
    join(items, " & ")
end

# function default_graph_requirement(sgraph)
#     is_connected(sgraph) || return false
#     # all(vertices(sgraph)) do v
#     #     length(neighbors(sgraph, v)) ≥ 1
#     # end
# end

# function sample_graph(n; d=3, requirement=default_graph_requirement)
#     for i in 1:10000
#         sgraph = expected_degree_graph(fill(d, n)) |> random_orientation_dag
#         # sgraph = expected_degree_graph(fill(2, n))
#         requirement(sgraph) && return neighbor_list(sgraph)
#     end
#     error("Can't sample a graph!")
# end

neighbor_list(sgraph) = neighbors.(Ref(sgraph), vertices(sgraph))

"Adjacency list representation of the tree with specified branching at each depth"
AdjacenyList = Vector{Vector{Int}}
function regular_tree(branching::Vector{Int})
    t = AdjacenyList()
    function rec!(d)
        children = Int[]
        push!(t, children)
        idx = length(t)
        if d <= length(branching)
            for i in 1:branching[d]
                child = rec!(d+1)
                push!(children, child)
            end
        end
        return idx
    end
    rec!(1)
    t
end

empty_tree = AdjacenyList([[]])

function tree_join(g1, g2)
    n1 = length(g1)

    g1 = map(x -> x .+ 1, g1)
    g2 = map(x -> x .+ 1 .+ n1, g2)

    [[[2, n1+2]]; g1; g2]
end

function random_tree(splits)
    splits == 0 && return empty_tree
    splits == 1 && return tree_join(empty_tree, empty_tree)
    left = rand(0:splits-1)
    right = splits-1 - left
    tree_join(random_tree(left), random_tree(right))
end

function sample_graph(n)
    @assert !iseven(n)
    # base = [[2, 3], [4, 5], [6, 7], [], [], [], []]
    base = random_tree(div(n, 2))
    perm = randperm(length(base))

    i = findfirst(isequal(1), perm)
    perm[1], perm[i] = 1, perm[1]

    graph = map(base[perm]) do x
        Int[findfirst(isequal(i), perm) for i in x]
    end
    start = findfirst(isequal(1), perm)
    graph, start
end

function linear_rewards(n)
    @assert iseven(n)
    n2 = div(n,2)
    [-n2:1:-1; 1:1:n2]
end

function exponential_rewards(n; base=2)
    # @assert iseven(n)
    n2 = div(n,2)
    v = base .^ (0:1:n2-1)
    if iseven(n)
        sort!([-v; v])
    else
        sort!([-v; 0; v])
    end
end

struct Shuffler{T}
    x::Vector{T}
end

function Random.rand(rng::AbstractRNG, s::Random.SamplerTrivial{<:Shuffler})
    shuffle(s[].x)
end

struct IIDSampler{T}
    n::Int
    x::Vector{T}
end

function Random.rand(rng::AbstractRNG, s::Random.SamplerTrivial{<:IIDSampler})
    (;n, x) = s[]
    rand(x, n)
end

function sample_trial(perm; n_good=rand(1:3), n_bad=rand(1:3), v_good=rand(1:3), v_bad=rand(-3:-1), revealed=true, kws...)
    graph, start = sample_graph(length(perm)+1)
    for es in graph
        es .-= 1
    end
    start -= 1

    good_mask = Union{Missing,Bool}[missing, missing, missing]
    good_dims = sample(1:3, n_good; replace=false)
    focal = good_dims[1]
    for i in good_dims
        good_mask[i] = rand((true, false))
    end

    bad_mask = Union{Missing,Bool}[missing, missing, missing]
    bad_mask[focal] = !good_mask[focal]
    if n_bad > 1
        bad_dims = sample(setdiff(1:3, focal), n_bad-1; replace=false)
        for i in bad_dims
            bad_mask[i] = rand((true, false))
        end
    end

    good = map(FEATURES[perm]) do f
        all(skipmissing(f .== good_mask))
    end

    bad = map(FEATURES[perm]) do f
        all(skipmissing(f .== bad_mask))
    end

    @assert !any(bad .& good)


    rewards = [0; @. good * v_good + bad * v_bad]
    (;
        start, graph, rewards, revealed,
        reward_info = (
            (;val=v_good, desc=describe_mask(good_mask), targets=findall(good)),
            (;val=v_bad, desc=describe_mask(bad_mask), targets=findall(bad))
        ),
        kws...
    )
end

function trial2problem(t)
    graph = map(t.graph) do es
        es .+ 1
    end
    Problem(graph, t.rewards, t.start+1, -1)
end

function intro_trial(perm; reward, kws...)
    t = sample_trial(perm)
    while true
        prob = trial2problem(t)
        if minimum(length, paths(prob)) ≥ 2
            break
        else
            t = sample_trial(perm)
        end
    end
    rewards = zeros(Int, length(perm)+1)
    if reward == :posneg
        rewards .= -1
        for s in t.graph[1]
            rewards[s+1] = 2
            # for s2 in t.graph[s+1]
            #     rewards[s+1] = -1
            # end
        end
    end
    (;t..., rewards, revealed=true, kws...)
end


function make_trials(; perm)
    # rdist = IIDSampler(n, rewards)
    (;
        intro = [
            intro_trial(perm; reward=:zero),
            intro_trial(perm; reward=:posneg),
        ],
        intro_describe = [
            sample_trial(perm; n_feature=1, value=2),
            sample_trial(perm; n_feature=2, value=1),
            sample_trial(perm; n_feature=3, value=3),
        ],
        practice_revealed = [sample_trial(perm) for i in 1:3],
        practice_twostage = [sample_trial(perm) for i in 1:3],
        intro_hover = [sample_trial(perm)],
        main_revealed = [sample_trial(perm) for i in 1:200],
        main_hidden = [sample_trial(perm) for i in 1:200],
        # calibration = intro,
        # eyetracking = [sample_problem(;kws..., n_steps) for n_steps in shuffle(repeat(3:5, 7))]
    )
end


# %% --------

version = "v23"
Random.seed!(hash(version))
# %% --------

dest = "static/json/config"
rm(dest, recursive=true)
mkpath(dest)
for i in 1:30
    n = length(IMAGES) + 1
    perm = randperm(n-1)
    trials = make_trials(;perm)
    parameters = (;
        images = IMAGES[perm],
    )

    write("$dest/$i.json", json((;parameters, trials)))
    println("$dest/$i.json")
end
